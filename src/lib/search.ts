import "server-only";
import { desc, inArray, sql } from "drizzle-orm";
import { db, recipes } from "@/db";
import { embedText } from "@/lib/ai/extract";

// Hybrid search with no LLM call in the loop:
//  1. ingredient overlap  -> "I have leeks, eggs and feta"
//  2. keywords            -> "shakshuka", "tart"
//  3. embeddings          -> "that lemony crunchy chicken thing"
// fused with reciprocal rank fusion.

export type RecipeCard = {
  id: string;
  title: string;
  titleEnglish: string;
  description: string | null;
  cuisine: string;
  course: string;
  diet: string[];
  season: string;
  totalMinutes: number | null;
  photo: string | null;
  match?: { have: string[]; missing: number };
};

const cardColumns = {
  id: recipes.id,
  title: recipes.title,
  titleEnglish: recipes.titleEnglish,
  description: recipes.description,
  cuisine: recipes.cuisine,
  course: recipes.course,
  diet: recipes.diet,
  season: recipes.season,
  totalMinutes: recipes.totalMinutes,
  photos: recipes.photos,
};

type CardRow = { photos: string[] } & Omit<RecipeCard, "photo" | "match">;
const toCard = ({ photos, ...r }: CardRow): RecipeCard => ({ ...r, photo: photos[0] ?? null });

export async function recentRecipes(limit = 60): Promise<RecipeCard[]> {
  const rows = await db().select(cardColumns).from(recipes).orderBy(desc(recipes.createdAt)).limit(limit);
  return rows.map(toCard);
}

/** Words of the query plus naive singular forms, for matching canonical ingredient names. */
export function queryVariants(q: string): string {
  const words = q.toLowerCase().match(/[\p{L}\p{N}'-]+/gu) ?? [];
  const singular = words.map((w) => {
    if (w.endsWith("ies")) return w.slice(0, -3) + "y";
    if (w.endsWith("oes") || w.endsWith("ches") || w.endsWith("shes")) return w.slice(0, -2);
    if (w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
    return w;
  });
  // Two copies keep multi-word names ("green onion") contiguous; "|" stops matches across the seam.
  return ` ${words.join(" ")} | ${singular.join(" ")} `;
}

export async function searchRecipes(q: string, limit = 24): Promise<RecipeCard[]> {
  const query = q.trim();
  if (!query) return recentRecipes(limit);

  const variants = queryVariants(query);
  const orQuery = (query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length > 2).join(" | ");

  const [byIngredient, byText, byMeaning] = await Promise.all([
    db().execute<{ recipe_id: string; have: string[]; missing: number }>(sql`
      with matched as (
        select id, name from ingredients
        where ${variants} like '% ' || name || ' %'
      )
      select ri.recipe_id,
             array_agg(m.name order by m.name) as have,
             (select count(*) from recipe_ingredients r2
               where r2.recipe_id = ri.recipe_id and not r2.optional
                 and r2.ingredient_id not in (select id from matched))::int as missing
      from recipe_ingredients ri
      join matched m on m.id = ri.ingredient_id
      group by ri.recipe_id
      order by count(*) desc, missing asc
      limit 40`),
    orQuery
      ? db().execute<{ id: string }>(sql`
          select id from recipes,
            to_tsvector('simple', title || ' ' || title_english || ' ' || coalesce(description, '') || ' '
              || cuisine || ' ' || course || ' ' || array_to_string(tags, ' ')) doc,
            to_tsquery('simple', ${orQuery}) tsq
          where doc @@ tsq
          order by ts_rank(doc, tsq) desc
          limit 40`)
      : Promise.resolve({ rows: [] as { id: string }[] }),
    embedText(query)
      .then((vec) =>
        db().execute<{ id: string }>(sql`
          select id from recipes where embedding is not null
          order by embedding <=> ${JSON.stringify(vec)}::vector
          limit 40`),
      )
      .catch((err) => {
        console.error("embedding search failed", err);
        return { rows: [] as { id: string }[] };
      }),
  ]);

  const scores = new Map<string, number>();
  const add = (ids: string[], weight: number) =>
    ids.forEach((id, rank) => scores.set(id, (scores.get(id) ?? 0) + weight / (60 + rank)));

  const matchInfo = new Map(byIngredient.rows.map((r) => [r.recipe_id, r]));
  // Naming two or more pantry ingredients is a strong signal of a "what can I make" query.
  const pantryQuery = byIngredient.rows.some((r) => r.have.length >= 2);
  add(byIngredient.rows.map((r) => r.recipe_id), pantryQuery ? 3 : 1);
  add(byText.rows.map((r) => r.id), 1.5);
  add(byMeaning.rows.map((r) => r.id), 1);

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id);
  if (ranked.length === 0) return [];

  const rows = await db().select(cardColumns).from(recipes).where(inArray(recipes.id, ranked));
  const byId = new Map(rows.map((r) => [r.id, toCard(r)]));
  return ranked
    .map((id) => {
      const card = byId.get(id);
      const m = matchInfo.get(id);
      return card && m ? { ...card, match: { have: m.have, missing: m.missing } } : card;
    })
    .filter((c): c is RecipeCard => !!c);
}
