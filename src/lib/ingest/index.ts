import { put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { db, recipes, sources, type SourceKind } from "@/db";
import { embedText, embeddingText, enrichRecipe, extractRecipe, type ExtractInput } from "@/lib/ai/extract";
import { findDuplicate, type DuplicateMatch } from "@/lib/dedupe";
import { linkIngredients } from "@/lib/ingredient-links";
import { randomToken } from "@/lib/tokens";
import { fetchPage, pageToPrompt } from "./url";

export type IncomingFile = { data: Uint8Array; mediaType: string; name: string };

export type IngestRequest =
  | { kind: "url"; url: string }
  | { kind: "text"; text: string }
  | { kind: "image" | "audio"; files: IncomingFile[]; caption?: string };

export class NotARecipeError extends Error {
  constructor() {
    super("I couldn't find a recipe in that.");
  }
}

export type IngestResult = { recipeId: string; duplicate: DuplicateMatch | null };

/**
 * Store the raw input, then extract, enrich, embed and save. If the result looks like a
 * recipe already in the book, it is saved but parked (hidden from search) until someone
 * picks keep original / replace / keep both.
 */
export async function ingest(req: IngestRequest, userId: string | null): Promise<IngestResult> {
  const sourceId = await saveSource(req, userId);
  try {
    const recipeId = await processSource(sourceId, req, userId);
    await db().update(sources).set({ status: "done" }).where(eq(sources.id, sourceId));
    const duplicate = await findDuplicate(recipeId).catch((err) => {
      console.error("duplicate check failed", err);
      return null;
    });
    if (duplicate) {
      await db().update(recipes).set({ duplicateOf: duplicate.id }).where(eq(recipes.id, recipeId));
    }
    return { recipeId, duplicate };
  } catch (err) {
    await db()
      .update(sources)
      .set({ status: "failed", error: err instanceof Error ? err.message : String(err) })
      .where(eq(sources.id, sourceId));
    throw err;
  }
}

async function saveSource(req: IngestRequest, userId: string | null): Promise<string> {
  const kind: SourceKind = req.kind;
  const [row] = await db()
    .insert(sources)
    .values({
      kind,
      url: req.kind === "url" ? req.url : null,
      text: req.kind === "text" ? req.text : req.kind !== "url" ? (req.caption ?? null) : null,
      createdBy: userId,
    })
    .returning({ id: sources.id });

  if (req.kind === "image" || req.kind === "audio") {
    const files = await Promise.all(
      req.files.map(async (f) => {
        const blob = await put(`sources/${row.id}/${f.name}`, Buffer.from(f.data), {
          access: "public",
          addRandomSuffix: true,
          contentType: f.mediaType,
        });
        return { url: blob.url, mediaType: f.mediaType };
      }),
    );
    await db().update(sources).set({ files }).where(eq(sources.id, row.id));
  }
  return row.id;
}

async function processSource(sourceId: string, req: IngestRequest, userId: string | null): Promise<string> {
  let input: ExtractInput;
  let heroImage: string | null = null;

  if (req.kind === "url") {
    const page = await fetchPage(req.url);
    heroImage = page.image;
    // Keep the readable page text so the Source view survives the site disappearing.
    await db().update(sources).set({ text: page.text }).where(eq(sources.id, sourceId));
    input = { kind: "text", text: pageToPrompt(page), url: page.url };
  } else if (req.kind === "text") {
    input = { kind: "text", text: req.text };
  } else {
    input = { kind: "files", files: req.files, caption: req.caption };
  }

  const extracted = await extractRecipe(input);
  if (!extracted.isRecipe || extracted.ingredients.length === 0) throw new NotARecipeError();

  const [enrichment, embedding] = await Promise.all([
    enrichRecipe(extracted),
    embedText(embeddingText(extracted)),
  ]);

  const [recipe] = await db()
    .insert(recipes)
    .values({
      title: extracted.title,
      titleEnglish: extracted.titleEnglish,
      description: extracted.description,
      language: extracted.language,
      author: extracted.author,
      servings: extracted.servings,
      prepMinutes: extracted.prepMinutes,
      cookMinutes: extracted.cookMinutes,
      totalMinutes: extracted.totalMinutes,
      ingredients: extracted.ingredients,
      steps: extracted.steps,
      enrichment,
      cuisine: extracted.cuisine,
      course: extracted.course,
      diet: extracted.diet,
      season: extracted.season,
      tags: extracted.tags,
      photos: heroImage ? [heroImage] : [],
      shareToken: randomToken(12),
      sourceId,
      embedding,
      createdBy: userId,
    })
    .returning({ id: recipes.id });

  await linkIngredients(recipe.id, extracted.ingredients);
  return recipe.id;
}
