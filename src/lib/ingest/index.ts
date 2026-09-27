import { put } from "@vercel/blob";
import { eq, inArray } from "drizzle-orm";
import { db, ingredients, recipeIngredients, recipes, sources, type SourceKind } from "@/db";
import { embedText, embeddingText, enrichRecipe, extractRecipe, type ExtractInput } from "@/lib/ai/extract";
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

/** Store the raw input, then extract, enrich, embed and save. Returns the new recipe id. */
export async function ingest(req: IngestRequest, userId: string | null): Promise<string> {
  const sourceId = await saveSource(req, userId);
  try {
    const recipeId = await processSource(sourceId, req, userId);
    await db().update(sources).set({ status: "done" }).where(eq(sources.id, sourceId));
    return recipeId;
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

export async function linkIngredients(recipeId: string, list: { canonical: string; optional: boolean }[]) {
  const byName = new Map<string, boolean>();
  for (const i of list) {
    const name = i.canonical.trim().toLowerCase();
    if (!name) continue;
    // Required wins if an ingredient appears both ways.
    byName.set(name, (byName.get(name) ?? true) && i.optional);
  }
  const names = [...byName.keys()];
  if (names.length === 0) return;

  await db()
    .insert(ingredients)
    .values(names.map((name) => ({ name })))
    .onConflictDoNothing();
  const rows = await db()
    .select({ id: ingredients.id, name: ingredients.name })
    .from(ingredients)
    .where(inArray(ingredients.name, names));

  await db().delete(recipeIngredients).where(eq(recipeIngredients.recipeId, recipeId));
  await db()
    .insert(recipeIngredients)
    .values(rows.map((r) => ({ recipeId, ingredientId: r.id, optional: byName.get(r.name) ?? false })));
}
