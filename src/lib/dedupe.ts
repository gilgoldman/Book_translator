import "server-only";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db, recipes } from "@/db";
import { isLikelyDuplicate } from "./dedupe-rules";
import { linkIngredients } from "./ingredient-links";

export type DuplicateMatch = { id: string; title: string; similarity: number; overlap: number };

/**
 * Cheap duplicate check after import: nearest neighbours by embedding (already computed
 * for search), then ingredient overlap from the join table. No extra LLM call.
 */
export async function findDuplicate(recipeId: string): Promise<DuplicateMatch | null> {
  const { rows } = await db().execute<{
    id: string;
    title: string;
    title_english: string;
    new_title: string;
    similarity: number;
    overlap: number;
    same_url: boolean;
  }>(sql`
    with me as (
      select r.id, r.embedding, r.title_english, s.url
      from recipes r left join sources s on s.id = r.source_id
      where r.id = ${recipeId}
    ),
    candidates as (
      select r.id, r.title, r.title_english, 1 - (r.embedding <=> me.embedding) as similarity,
             (s.url is not null and s.url = me.url) as same_url
      from recipes r cross join me
      left join sources s on s.id = r.source_id
      where r.id <> me.id and r.duplicate_of is null and r.embedding is not null
      order by r.embedding <=> me.embedding
      limit 5
    )
    select c.id, c.title, c.title_english, me.title_english as new_title, c.similarity, c.same_url,
      coalesce((
        select count(*) filter (where a.ingredient_id is not null and b.ingredient_id is not null)::float
             / nullif(count(*), 0)
        from (select ingredient_id from recipe_ingredients where recipe_id = me.id) a
        full join (select ingredient_id from recipe_ingredients where recipe_id = c.id) b using (ingredient_id)
      ), 0) as overlap
    from candidates c cross join me
    order by c.same_url desc, c.similarity desc`);

  for (const r of rows) {
    const sameTitle = normalizeTitle(r.title_english) === normalizeTitle(r.new_title);
    if (
      r.same_url ||
      isLikelyDuplicate({ similarity: Number(r.similarity), overlap: Number(r.overlap), sameTitle })
    ) {
      return { id: r.id, title: r.title, similarity: Number(r.similarity), overlap: Number(r.overlap) };
    }
  }
  return null;
}

function normalizeTitle(t: string) {
  return t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export type DuplicateChoice = "keep-original" | "replace" | "keep-both";

/** Applies the user's choice. Returns the id of the recipe to show afterwards. */
export async function resolveDuplicate(
  newId: string,
  choice: DuplicateChoice,
  actor: { userId: string; isAdmin: boolean },
): Promise<string> {
  const fresh = await db().query.recipes.findFirst({ where: eq(recipes.id, newId) });
  if (!fresh?.duplicateOf) return newId;
  const original = await db().query.recipes.findFirst({
    where: eq(recipes.id, fresh.duplicateOf),
    columns: { id: true, createdBy: true, photos: true },
  });
  if (!original) {
    await db().update(recipes).set({ duplicateOf: null }).where(eq(recipes.id, newId));
    return newId;
  }
  if (!actor.isAdmin && fresh.createdBy && fresh.createdBy !== actor.userId) {
    throw new Error("Only the person who imported it can decide.");
  }

  if (choice === "keep-both") {
    await db().update(recipes).set({ duplicateOf: null }).where(eq(recipes.id, newId));
    return newId;
  }
  if (choice === "keep-original") {
    await db().delete(recipes).where(eq(recipes.id, newId));
    return original.id;
  }

  // Replace: the original keeps its id, share link, notes and your own photos; the content is new.
  if (!canEdit(original, actor)) throw new Error("Only the owner or whoever added the original can replace it.");
  await db()
    .update(recipes)
    .set({
      title: fresh.title,
      titleEnglish: fresh.titleEnglish,
      description: fresh.description,
      language: fresh.language,
      author: fresh.author,
      servings: fresh.servings,
      prepMinutes: fresh.prepMinutes,
      cookMinutes: fresh.cookMinutes,
      totalMinutes: fresh.totalMinutes,
      ingredients: fresh.ingredients,
      steps: fresh.steps,
      enrichment: fresh.enrichment,
      translations: fresh.translations,
      cuisine: fresh.cuisine,
      course: fresh.course,
      diet: fresh.diet,
      season: fresh.season,
      tags: fresh.tags,
      photos: [...new Set([...original.photos, ...fresh.photos])],
      sourceId: fresh.sourceId,
      embedding: fresh.embedding,
      updatedAt: new Date(),
    })
    .where(eq(recipes.id, original.id));
  await linkIngredients(original.id, fresh.ingredients);
  await db().delete(recipes).where(eq(recipes.id, newId));
  return original.id;
}

export function canEdit(recipe: { createdBy: string | null }, actor: { userId: string; isAdmin: boolean }) {
  return actor.isAdmin || recipe.createdBy === null || recipe.createdBy === actor.userId;
}

/** Imports by this person still waiting for a keep/replace decision. */
export async function pendingDuplicates(userId: string, isAdmin: boolean, locale: string) {
  return db()
    .select({ id: recipes.id, title: sql<string>`coalesce(${recipes.translations}->${locale}->>'title', ${recipes.title})` })
    .from(recipes)
    .where(
and(isNotNull(recipes.duplicateOf), isAdmin ? undefined : eq(recipes.createdBy, userId)),
    );
}
