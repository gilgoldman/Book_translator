import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db, ingredients, recipeIngredients } from "@/db";

/** Rebuilds a recipe's rows in the canonical-ingredient graph. */
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
