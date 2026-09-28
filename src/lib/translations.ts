import "server-only";
import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, recipeColumns, recipes, type Recipe } from "@/db";
import { retryIfBusy } from "@/lib/ai/errors";
import { enrichRecipe } from "@/lib/ai/extract";
import { translateRecipeText } from "@/lib/ai/translate";
import { LOCALE_CODES, LOCALES, type Locale } from "@/lib/i18n/config";
import { ensureIngredientNames } from "@/lib/ingredient-names";
import { claim, pruneRateLimits, release } from "@/lib/rate-limit";
import { applyText, recipeText, type RecipeContent, type RecipeTranslation } from "@/lib/recipe-text";
import { ENRICHMENT_VERSION } from "@/lib/recipe-types";

// Every recipe is stored in the language it came in, plus a translation into each other
// app language. A translation remembers a hash of the words it was made from, so an edit
// makes it stale and it is redone.
//
// It also remembers a hash of just the recipe's own words (`source`). When only the app
// moved on (a new prompt or step format), the old translation is still right about this
// recipe, so readers keep seeing it while a new one is made. After an edit it isn't, so
// readers see the original until the new translation is in.
//
// After bumping PROMPT_VERSION or ENRICHMENT_VERSION, deploy and run `npm run translate`
// so every recipe is redone at once instead of on its next view.

const PROMPT_VERSION = "2";

/** How long one background run can own a recipe; after a failure, also the wait before the next try. */
const RUN_SECONDS = 5 * 60;

export function textHash(r: RecipeContent) {
  return createHash("sha256").update(PROMPT_VERSION).update(JSON.stringify(recipeText(r))).digest("hex").slice(0, 16);
}

/** The recipe's own words, whatever format the app keeps its derived views in. */
export function sourceHash(r: Pick<RecipeContent, "title" | "description" | "servings" | "ingredients" | "steps">) {
  const words = [
    r.title,
    r.description,
    r.servings,
    r.ingredients.map((i) => [i.group, i.name, i.note, i.original, i.metric, i.volume]),
    r.steps.map((s) => [s.text, s.timers.map((t) => [t.label, t.seconds])]),
  ];
  return createHash("sha256").update(JSON.stringify(words)).digest("hex").slice(0, 16);
}

/** App languages this recipe needs a translation into. */
export const targetLocales = (language: string) => LOCALE_CODES.filter((l) => l !== language);

export type Localized<R> = {
  recipe: R;
  /**
   * original: shown as written; translated: in the reader's language; outdated: an older
   * translation of the same words, shown while a new one is made; pending: none yet, showing the original.
   */
  status: "original" | "translated" | "outdated" | "pending";
  /** The language the words are in now. */
  language: string;
  /** Something is missing or old: worth running `ensureTranslations` in the background. */
  refresh: boolean;
};

type Localizable = RecipeContent & Pick<Recipe, "language" | "translations">;

/** Effective steps written by an older format, which can mix up words and ingredient names. */
export const enrichmentOutdated = (r: Pick<RecipeContent, "enrichment">) =>
  !!r.enrichment && (r.enrichment.version ?? 1) < ENRICHMENT_VERSION;

/** The recipe as written (the reader's language, or they asked for the original). */
export function asWritten<R extends Localizable>(r: R): Localized<R> {
  return { recipe: r, status: "original", language: r.language, refresh: enrichmentOutdated(r) };
}

/** The recipe in the reader's language when there's a usable translation, else as written. */
export function localizeRecipe<R extends Localizable>(r: R, locale: Locale): Localized<R> {
  if (r.language === locale) return asWritten(r);
  const tr = r.translations[locale];
  if (tr && tr.hash === textHash(r)) {
    // A translation from before `source` existed gets it added (no AI), so it can stand in
    // for its successor after the next format change.
    return { recipe: applyText(r, tr), status: "translated", language: locale, refresh: !tr.source || enrichmentOutdated(r) };
  }
  if (tr?.source && tr.source === sourceHash(r)) {
    return { recipe: applyText(r, tr), status: "outdated", language: locale, refresh: true };
  }
  return { recipe: r, status: "pending", language: r.language, refresh: true };
}

/**
 * Translate a recipe into every app language (or just `only`) that lacks a current
 * translation, after rewriting its effective steps if they are in an old format.
 * One run at a time per recipe and language: a call while another is working on the same
 * words (or within a few minutes of it failing) does nothing. Failures are logged, not
 * thrown: readers keep the older translation or the original, and a later view retries.
 */
export async function ensureTranslations(recipeId: string, only?: Locale[]): Promise<void> {
  let r = await db().query.recipes.findFirst({ where: eq(recipes.id, recipeId), columns: recipeColumns });
  if (!r) return;
  if (enrichmentOutdated(r)) {
    // Someone else is rewriting them (or just failed to): leave it to them, or to a later view.
    const key = `enrich:${recipeId}`;
    if (!(await claim(key, RUN_SECONDS))) return;
    // Rewrite old effective steps first, so the translations are made from the new ones.
    try {
      const current = r;
      const enrichment = await retryIfBusy(() => enrichRecipe(current));
      await db().update(recipes).set({ enrichment }).where(eq(recipes.id, recipeId));
      await release(key);
      r = { ...r, enrichment };
    } catch (err) {
      console.error(`re-enriching ${recipeId} failed`, err);
    }
  }
  const { translations } = r;
  const hash = textHash(r);
  const source = sourceHash(r);
  const text = recipeText(r);
  const wanted = targetLocales(r.language).filter((l) => !only || only.includes(l));
  const unstamped = wanted.filter((l) => translations[l]?.hash === hash && !translations[l]?.source);
  const lock = (l: Locale) => `translate:${recipeId}:${hash}:${l}`;
  const todo: Locale[] = [];
  for (const l of wanted) {
    if (translations[l]?.hash !== hash && (await claim(lock(l), RUN_SECONDS))) todo.push(l);
  }
  await Promise.all([
    ensureIngredientNames(r.ingredients.map((i) => i.canonical)).catch((err) =>
      console.error("ingredient names failed", err),
    ),
    ...unstamped.map((locale) =>
      db()
        .update(recipes)
        .set({ translations: sql`jsonb_set(${recipes.translations}, ${`{${locale},source}`}::text[], to_jsonb(${source}::text))` })
        .where(eq(recipes.id, recipeId))
        .catch((err) => console.error(`stamping ${recipeId} ${locale} failed`, err)),
    ),
    ...todo.map(async (locale) => {
      try {
        const translated = await retryIfBusy(() => translateRecipeText(text, LOCALES[locale].englishName));
        const saved: RecipeTranslation = { ...translated, hash, source };
        // Merge one key, so parallel translations don't overwrite each other.
        await db()
          .update(recipes)
          .set({
            translations: sql`${recipes.translations} || jsonb_build_object(${locale}::text, ${JSON.stringify(saved)}::jsonb)`,
          })
          .where(eq(recipes.id, recipeId));
        await release(lock(locale));
      } catch (err) {
        console.error(`translating ${recipeId} into ${locale} failed`, err);
      }
    }),
  ]);
  if (todo.length) await pruneRateLimits().catch((err) => console.error("pruning rate limits failed", err));
}
