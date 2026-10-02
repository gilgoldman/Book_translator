import "server-only";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, recipes, users } from "@/db";
import { embedText } from "@/lib/ai/extract";
import type { Locale } from "@/lib/i18n/config";
import { localNames } from "@/lib/ingredient-names";

// Hybrid search with no LLM call in the loop:
//  1. ingredient overlap  -> "I have leeks, eggs and feta"
//  2. keywords            -> "shakshuka", "tart"
//  3. embeddings          -> "that lemony crunchy chicken thing"
// fused with reciprocal rank fusion.

export type RecipeCard = {
  id: string;
  /** In the reader's language when a translation exists. */
  title: string;
  originalTitle: string;
  description: string | null;
  cuisine: string;
  course: string;
  diet: string[];
  season: string;
  totalMinutes: number | null;
  photo: string | null;
  addedBy: { username: string; name: string; avatar: string | null } | null;
  match?: { have: string[]; missing: number };
};

const cardColumns = (locale: Locale) => ({
  id: recipes.id,
  title: sql<string>`coalesce(${recipes.translations}->${locale}->>'title', ${recipes.title})`,
  originalTitle: recipes.title,
  description: recipes.description,
  cuisine: recipes.cuisine,
  course: recipes.course,
  diet: recipes.diet,
  season: recipes.season,
  totalMinutes: recipes.totalMinutes,
  photos: recipes.photos,
  username: users.username,
  displayName: users.displayName,
  avatar: users.avatarUrl,
});

type CardRow = {
  photos: string[];
  username: string | null;
  displayName: string | null;
  avatar: string | null;
} & Omit<RecipeCard, "photo" | "match" | "addedBy">;

const toCard = ({ photos, username, displayName, avatar, ...r }: CardRow): RecipeCard => ({
  ...r,
  photo: photos[0] ?? null,
  addedBy: username ? { username, name: displayName || username, avatar } : null,
});

function cards(locale: Locale) {
  return db().select(cardColumns(locale)).from(recipes).leftJoin(users, eq(users.id, recipes.createdBy));
}

/** Newest first; optionally only the recipes one person added. */
export async function recentRecipes(locale: Locale, limit = 60, byUsername?: string): Promise<RecipeCard[]> {
  const rows = await cards(locale)
    .where(and(isNull(recipes.duplicateOf), byUsername ? eq(users.username, byUsername) : undefined))
    .orderBy(desc(recipes.createdAt))
    .limit(limit);
  return rows.map(toCard);
}

/** Newest first, in any of these cuisines: the pool for a menu ("an Italian dinner"). */
export async function recipesInCuisines(cuisines: string[], locale: Locale, limit = 120): Promise<RecipeCard[]> {
  if (cuisines.length === 0) return [];
  const rows = await cards(locale)
    .where(and(isNull(recipes.duplicateOf), inArray(recipes.cuisine, cuisines)))
    .orderBy(desc(recipes.createdAt))
    .limit(limit);
  return rows.map(toCard);
}

/**
 * The member someone means by "Dana" or "dana_g": an exact username or display name first,
 * else the first name of a display name, else a username starting with it.
 */
export async function findCook(said: string): Promise<{ username: string; name: string } | null> {
  const who = said.trim().toLowerCase().replace(/^@/, "");
  if (!who) return null;
  const like = who.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { rows } = await db().execute<{ username: string; name: string }>(sql`
    select username, coalesce(nullif(display_name, ''), username) as name from users
    where status = 'approved'
      and (lower(username) = ${who} or lower(display_name) = ${who}
           or lower(display_name) like ${like} || ' %' or lower(username) like ${like} || '%')
    order by (lower(username) = ${who} or lower(display_name) = ${who}) desc, length(username)
    limit 1`);
  return rows[0] ?? null;
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
  // Hebrew glues prepositions to words ("ופטה" = "and feta"): also try without up to two of them.
  const unprefixed = words.map((w) => (/^[\u0590-\u05ff]{4,}$/.test(w) ? w.replace(/^[והבלמשכ]{1,2}(?=[\u0590-\u05ff]{3})/, "") : w));
  // Separate copies keep multi-word names ("green onion") contiguous; "|" stops matches across seams.
  return ` ${words.join(" ")} | ${singular.join(" ")} | ${unprefixed.join(" ")} `;
}

// Question words that would match almost any recipe's text ("what recipes do we have with peas").
const FILLER = new Set(
  (
    "what which how can could make cook recipe recipes dish dishes something anything have has got any all the " +
    "and with for from into using use some that this those these our your you are was were there here want " +
    "מה איזה אילו איך אפשר להכין לבשל מתכון מתכונים מנה מנות יש לנו לי משהו עם של את גם בבקשה רוצה"
  ).split(" "),
);

/**
 * Closest a recipe must be to the query's meaning (cosine distance) to count on meaning alone.
 * Without a cutoff the nearest recipe always "matches", even for things the book doesn't have.
 */
const MAX_MEANING_DISTANCE = 0.35;

export async function searchRecipes(q: string, locale: Locale, limit = 24): Promise<RecipeCard[]> {
  const query = q.trim();
  if (!query) return recentRecipes(locale, limit);

  const variants = queryVariants(query);
  const orQuery = (query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((w) => w.length > 2 && !FILLER.has(w))
    .join(" | ");

  const [byIngredient, byText, byMeaning] = await Promise.all([
    db().execute<{ recipe_id: string; have: string[]; missing: number }>(sql`
      with matched as (
        select id, name from ingredients
        where ${variants} like '% ' || name || ' %'
           -- names in other languages, e.g. "ביצים" for egg
           or exists (select 1 from jsonb_each(names) l(code, list), jsonb_array_elements_text(l.list) n
                      where ${variants} like '% ' || lower(n) || ' %')
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
              || cuisine || ' ' || course || ' ' || array_to_string(tags, ' ') || ' '
              || coalesce((select string_agg(concat_ws(' ', v->>'title', v->>'description'), ' ')
                           from jsonb_each(translations) t(k, v)), '')) doc,
            to_tsquery('simple', ${orQuery}) tsq
          where doc @@ tsq
          order by ts_rank(doc, tsq) desc
          limit 40`)
      : Promise.resolve({ rows: [] as { id: string }[] }),
    embedText(query)
      .then((vec) =>
        db().execute<{ id: string; distance: number }>(sql`
          select id, embedding <=> ${JSON.stringify(vec)}::vector as distance from recipes
          where embedding is not null
          order by distance
          limit 40`),
      )
      .then(({ rows }) => {
        // Logged so the cutoff can be tuned against real searches.
        console.info("meaning search", JSON.stringify({ query, closest: rows.slice(0, 3).map((r) => Number(r.distance).toFixed(3)) }));
        return { rows: rows.filter((r) => Number(r.distance) <= MAX_MEANING_DISTANCE) };
      })
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

  // Imports parked as possible duplicates stay hidden until someone decides.
  const rows = await cards(locale).where(and(inArray(recipes.id, ranked), isNull(recipes.duplicateOf)));
  const byId = new Map(rows.map((r) => [r.id, toCard(r)]));
  const names = await localNames(byIngredient.rows.flatMap((r) => r.have), locale);
  return ranked
    .map((id) => {
      const card = byId.get(id);
      const m = matchInfo.get(id);
      return card && m
        ? { ...card, match: { have: m.have.map((n) => names.get(n) ?? n), missing: m.missing } }
        : card;
    })
    .filter((c): c is RecipeCard => !!c);
}
