import "server-only";
import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, recipes, type Recipe } from "@/db";
import { translateRecipeText } from "@/lib/ai/translate";
import { LOCALE_CODES, LOCALES, type Locale } from "@/lib/i18n/config";
import { ensureIngredientNames } from "@/lib/ingredient-names";
import { applyText, recipeText, type RecipeContent } from "@/lib/recipe-text";

// Every recipe is stored in the language it came in, plus a translation into each other
// app language. A translation remembers a hash of the words it was made from, so an edit
// makes it stale and it is redone.

const PROMPT_VERSION = "1";

export function textHash(r: RecipeContent) {
  return createHash("sha256").update(PROMPT_VERSION).update(JSON.stringify(recipeText(r))).digest("hex").slice(0, 16);
}

/** App languages this recipe needs a translation into. */
export const targetLocales = (language: string) => LOCALE_CODES.filter((l) => l !== language);

export type Localized<R> = {
  recipe: R;
  /** original: shown as written; translated: in the reader's language; pending: not ready, showing the original. */
  status: "original" | "translated" | "pending";
  /** The language the words are in now. */
  language: string;
};

/** The recipe in the reader's language, or the original if that is theirs or no current translation exists. */
export function localizeRecipe<R extends RecipeContent & Pick<Recipe, "language" | "translations">>(
  r: R,
  locale: Locale,
): Localized<R> {
  if (r.language === locale) return { recipe: r, status: "original", language: r.language };
  const tr = r.translations[locale];
  if (!tr || tr.hash !== textHash(r)) return { recipe: r, status: "pending", language: r.language };
  return { recipe: applyText(r, tr), status: "translated", language: locale };
}

/**
 * Translate a recipe into every app language (or just `only`) that lacks a current
 * translation. Failures are logged, not thrown: the original still shows, and the next
 * view retries.
 */
export async function ensureTranslations(recipeId: string, only?: Locale[]): Promise<void> {
  const r = await db().query.recipes.findFirst({ where: eq(recipes.id, recipeId) });
  if (!r) return;
  const hash = textHash(r);
  const text = recipeText(r);
  const todo = targetLocales(r.language).filter(
    (l) => (!only || only.includes(l)) && r.translations[l]?.hash !== hash,
  );
  await Promise.all([
    ensureIngredientNames(r.ingredients.map((i) => i.canonical)).catch((err) =>
      console.error("ingredient names failed", err),
    ),
    ...todo.map(async (locale) => {
      try {
        const translated = await translateRecipeText(text, LOCALES[locale].englishName);
        // Merge one key, so parallel translations don't overwrite each other.
        await db()
          .update(recipes)
          .set({
            translations: sql`${recipes.translations} || jsonb_build_object(${locale}::text, ${JSON.stringify({ ...translated, hash })}::jsonb)`,
          })
          .where(eq(recipes.id, recipeId));
      } catch (err) {
        console.error(`translating ${recipeId} into ${locale} failed`, err);
      }
    }),
  ]);
}
