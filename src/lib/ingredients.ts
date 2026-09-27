import "server-only";
import { inArray, like, sql } from "drizzle-orm";
import { db, ingredients } from "@/db";
import { singular } from "./ingredient-intent";

// Ingredient-first queries over the canonical ingredient graph.

// Too common to be interesting as a pairing.
const STAPLES = ["salt", "water", "black pepper", "pepper", "olive oil", "oil", "sugar", "vegetable oil"];

/** Map free text ("Leeks") to the canonical name we store ("leek"). */
export async function resolveIngredient(text: string): Promise<string> {
  const raw = text.trim().toLowerCase();
  const base = singular(raw);
  const exact = await db()
    .select({ name: ingredients.name })
    .from(ingredients)
    .where(inArray(ingredients.name, [raw, base]))
    .limit(1);
  if (exact[0]) return exact[0].name;
  // "leek" -> "baby leek": the shortest name ending in the word.
  const close = await db()
    .select({ name: ingredients.name })
    .from(ingredients)
    .where(like(ingredients.name, `% ${base}`))
    .orderBy(sql`length(${ingredients.name})`)
    .limit(1);
  return close[0]?.name ?? base;
}

export type IngredientUse = {
  id: string;
  title: string;
  grams: number | null;
  amount: string | null;
  photo: string | null;
  season: string;
};

/** Recipes that use the most of an ingredient: "I have a lot of leeks". */
export async function recipesUsingMost(name: string, limit = 24): Promise<IngredientUse[]> {
  const { rows } = await db().execute<{
    id: string;
    title: string;
    grams: number | null;
    amount: string | null;
    photo: string | null;
    season: string;
  }>(sql`
    select r.id, r.title, r.season, r.photos->>0 as photo,
           sum((e->>'grams')::numeric)::float as grams,
           string_agg(coalesce(e->>'metric', e->>'original'), ' + ') as amount
    from recipes r
    cross join lateral jsonb_array_elements(r.ingredients) e
    where lower(e->>'canonical') = ${name} and r.duplicate_of is null
    group by r.id
    order by sum((e->>'grams')::numeric) desc nulls last, r.title
    limit ${limit}`);
  return rows.map((r) => ({ ...r, grams: r.grams === null ? null : Number(r.grams) }));
}

/** Ingredients that most often share a recipe with this one. */
export async function goesWellWith(name: string, limit = 12): Promise<{ name: string; count: number }[]> {
  const { rows } = await db().execute<{ name: string; count: number }>(sql`
    select other.name, count(*)::int as count
    from ingredients me
    join recipe_ingredients a on a.ingredient_id = me.id
    join recipe_ingredients b on b.recipe_id = a.recipe_id and b.ingredient_id <> a.ingredient_id
    join ingredients other on other.id = b.ingredient_id
    join recipes r on r.id = a.recipe_id and r.duplicate_of is null
    where me.name = ${name}
      and other.name not in ${STAPLES}
    group by other.name
    order by count(*) desc, other.name
    limit ${limit}`);
  return rows;
}
