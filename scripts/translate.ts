// Translates every recipe into every app language it's missing or has out of date, and
// names every ingredient. Run after adding a language, and after bumping PROMPT_VERSION
// (src/lib/translations.ts) or ENRICHMENT_VERSION (src/lib/recipe-types.ts). Recipes also
// redo themselves the first time someone opens them, so this is only a head start.
import "dotenv/config";
import { db, ingredients, recipes } from "../src/db";
import { ensureIngredientNames } from "../src/lib/ingredient-names";
import { ensureTranslations } from "../src/lib/translations";

const all = await db().select({ id: recipes.id, title: recipes.title }).from(recipes);
for (const r of all) {
  await ensureTranslations(r.id);
  console.log("✓", r.title);
}
const names = await db().select({ name: ingredients.name }).from(ingredients);
for (let i = 0; i < names.length; i += 100) {
  await ensureIngredientNames(names.slice(i, i + 100).map((n) => n.name));
}
console.log(`Checked ${all.length} recipes and ${names.length} ingredients.`);
