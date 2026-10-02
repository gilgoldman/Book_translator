import { put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { after } from "next/server";
import { db, recipeColumns, recipes, sources, type Source, type SourceKind } from "@/db";
import { embedText, embeddingText, enrichRecipe, extractRecipe, type ExtractInput } from "@/lib/ai/extract";
import { findDuplicate, type DuplicateMatch } from "@/lib/dedupe";
import type { Locale } from "@/lib/i18n/config";
import { linkIngredients } from "@/lib/ingredient-links";
import { contentChanged, recipeText, type RecipeText } from "@/lib/recipe-changes";
import { randomToken } from "@/lib/tokens";
import type { ExtractedRecipe } from "@/lib/recipe-types";
import { ensureTranslations } from "@/lib/translations";
import { dishPhotos } from "./photos";
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
 * Store the raw input, then extract, enrich, embed, translate and save. If the result looks like a
 * recipe already in the book, it is saved but parked (hidden from search) until someone
 * picks keep original / replace / keep both.
 *
 * `reader` is the language the importer reads in: when the recipe came in another one,
 * that translation is made before returning; every other language follows in the background.
 */
export async function ingest(req: IngestRequest, userId: string | null, reader?: Locale): Promise<IngestResult> {
  const { id: sourceId, files } = await saveSource(req, userId);
  try {
    const { id: recipeId, language } = await processSource(sourceId, req, userId, files);
    await db().update(sources).set({ status: "done" }).where(eq(sources.id, sourceId));
    const [duplicate] = await Promise.all([
      findDuplicate(recipeId).catch((err) => {
        console.error("duplicate check failed", err);
        return null;
      }),
      reader && reader !== language ? ensureTranslations(recipeId, [reader]) : null,
    ]);
    // Every app language gets its version now, so no one waits for it later.
    after(() => ensureTranslations(recipeId));
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

type StoredFile = { url: string; mediaType: string };

/** The source row, and where its files went (in the order they were sent). */
async function saveSource(req: IngestRequest, userId: string | null): Promise<{ id: string; files: StoredFile[] }> {
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
    return { id: row.id, files };
  }
  return { id: row.id, files: [] };
}

async function processSource(
  sourceId: string,
  req: IngestRequest,
  userId: string | null,
  files: StoredFile[],
): Promise<{ id: string; language: string }> {
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

  const { content, dishImages } = await structure(input);
  // A photo of the finished dish sent along with the recipe becomes its cover.
  const photos = heroImage ? [heroImage] : dishPhotos(files, dishImages);
  const [recipe] = await db()
    .insert(recipes)
    .values({
      ...content,
      photos,
      shareToken: randomToken(12),
      sourceId,
      createdBy: userId,
    })
    .returning({ id: recipes.id });

  await linkIngredients(recipe.id, content.ingredients);
  return { id: recipe.id, language: content.language };
}

/** Extract + enrich + embed: everything about a recipe that the LLM derives. */
async function structure(input: ExtractInput) {
  return finish(await extract(input));
}

async function extract(input: ExtractInput) {
  const extracted = await extractRecipe(input);
  if (!extracted.isRecipe || extracted.ingredients.length === 0) throw new NotARecipeError();
  return extracted;
}

/** Enrich + embed what was extracted. */
async function finish(extracted: ExtractedRecipe) {
  const [enrichment, embedding] = await Promise.all([
    enrichRecipe(extracted),
    embedText(embeddingText(extracted)),
  ]);
  const content = {
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
    embedding,
  };
  return { content, dishImages: extracted.dishImages };
}

/**
 * Rebuild a recipe after someone edited its ingredients or method by hand, so the
 * effective and ratio views, units and search stay consistent. Keeps id, share link,
 * notes, photos, source and uploader, and what they set by hand: title, description, servings,
 * times and categories.
 */
export async function restructureRecipe(recipeId: string, edited: { title: string; ingredients: string; method: string }) {
  const text = `${edited.title}\n\nIngredients:\n${edited.ingredients}\n\nMethod:\n${edited.method}`;
  const { content } = await structure({ kind: "text", text });
  await db()
    .update(recipes)
    .set({
      titleEnglish: content.titleEnglish,
      language: content.language,
      ingredients: content.ingredients,
      steps: content.steps,
      enrichment: content.enrichment,
      tags: content.tags,
      embedding: content.embedding,
      updatedAt: new Date(),
    })
    .where(eq(recipes.id, recipeId));
  await linkIngredients(recipeId, content.ingredients);
}

/** What a saved source says, ready to read again. The live page for a link, else the text kept from it. */
async function sourceInput(source: Source): Promise<ExtractInput> {
  if (source.kind === "url" && source.url) {
    try {
      const page = await fetchPage(source.url);
      return { kind: "text", text: pageToPrompt(page), url: page.url };
    } catch (err) {
      if (!source.text) throw err;
      console.warn("re-read: the page is gone, using the text kept from it", err);
      return { kind: "text", text: source.text, url: source.url };
    }
  }
  if (source.kind === "text") {
    if (!source.text) throw new NotARecipeError();
    return { kind: "text", text: source.text };
  }
  const files = await Promise.all(
    source.files.map(async (f) => {
      const res = await fetch(f.url);
      if (!res.ok) throw new Error(`couldn't download ${f.url}: ${res.status}`);
      return { data: new Uint8Array(await res.arrayBuffer()), mediaType: f.mediaType };
    }),
  );
  return { kind: "files", files, caption: source.text ?? undefined };
}

/**
 * Read a recipe's original again (photos, voice note, page or text), for someone to compare
 * with what's in the book before choosing to use it. Nothing is saved.
 */
export async function rereadSource(recipeId: string): Promise<ExtractedRecipe> {
  const recipe = await db().query.recipes.findFirst({ where: eq(recipes.id, recipeId), columns: { sourceId: true } });
  if (!recipe?.sourceId) throw new Error("This recipe has no original");
  const source = await db().query.sources.findFirst({ where: eq(sources.id, recipe.sourceId) });
  if (!source) throw new Error("This recipe has no original");
  return extract(await sourceInput(source));
}

/** Use a re-read in place of what's in the book. Keeps id, share link, notes, photos, source and uploader. */
export async function applyReread(recipeId: string, extracted: ExtractedRecipe) {
  const { content } = await finish(extracted);
  await db()
    .update(recipes)
    .set({ ...content, updatedAt: new Date() })
    .where(eq(recipes.id, recipeId));
  await linkIngredients(recipeId, content.ingredients);
}

/**
 * Save a corrected recipe: title, servings and times as given; the ingredients and method, if they
 * changed, re-read so every view stays right. False when the recipe is gone.
 */
export async function saveCorrection(recipeId: string, text: RecipeText): Promise<boolean> {
  const current = await db().query.recipes.findFirst({ where: eq(recipes.id, recipeId), columns: recipeColumns });
  if (!current) return false;
  await db()
    .update(recipes)
    .set({
      title: text.title.trim() || current.title,
      servings: text.servings?.trim() || null,
      prepMinutes: text.prepMinutes,
      cookMinutes: text.cookMinutes,
      totalMinutes: text.totalMinutes,
      updatedAt: new Date(),
    })
    .where(eq(recipes.id, recipeId));
  if (contentChanged(recipeText(current), text)) {
    await restructureRecipe(recipeId, {
      title: text.title,
      ingredients: text.ingredients.join("\n"),
      method: text.steps.join("\n\n"),
    });
  }
  after(() => ensureTranslations(recipeId));
  return true;
}
