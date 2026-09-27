import "server-only";
import { inArray, sql } from "drizzle-orm";
import { db, ingredients } from "@/db";
import { canonicalIngredient, translateIngredientNames } from "@/lib/ai/translate";
import { DEFAULT_LOCALE, LOCALE_CODES, LOCALES, type Locale } from "@/lib/i18n/config";
import { singular } from "./ingredient-intent";

// Ingredients are indexed by a canonical English name ("leek"). These helpers show them
// in the reader's language and map what people type ("כרישות") back to the canonical name.

/** Fill in missing display names for these ingredients in every non-English app language. */
export async function ensureIngredientNames(canonicals: string[]) {
  const unique = [...new Set(canonicals)];
  if (!unique.length) return;
  const rows = await db()
    .select({ name: ingredients.name, names: ingredients.names })
    .from(ingredients)
    .where(inArray(ingredients.name, unique));
  for (const locale of LOCALE_CODES) {
    if (locale === DEFAULT_LOCALE) continue;
    const missing = rows.filter((r) => !r.names[locale]?.length).map((r) => r.name);
    if (!missing.length) continue;
    const named = await translateIngredientNames(missing, LOCALES[locale].englishName);
    for (const n of named) {
      if (!missing.includes(n.canonical)) continue;
      const forms = [...new Set([n.singular.trim(), n.plural.trim()].filter(Boolean))];
      await db()
        .update(ingredients)
        .set({ names: sql`${ingredients.names} || jsonb_build_object(${locale}::text, ${JSON.stringify(forms)}::jsonb)` })
        .where(sql`${ingredients.name} = ${n.canonical}`);
    }
  }
}

/** canonical -> display name in this language (falls back to the canonical name). */
export async function localNames(canonicals: string[], locale: Locale): Promise<Map<string, string>> {
  const map = new Map(canonicals.map((c) => [c, c]));
  if (locale === DEFAULT_LOCALE || !canonicals.length) return map;
  const rows = await db()
    .select({ name: ingredients.name, names: ingredients.names })
    .from(ingredients)
    .where(inArray(ingredients.name, [...new Set(canonicals)]));
  for (const r of rows) {
    const local = r.names[locale]?.[0];
    if (local) map.set(r.name, local);
  }
  return map;
}

export async function localName(canonical: string, locale: Locale) {
  return (await localNames([canonical], locale)).get(canonical) ?? canonical;
}

// Hebrew glues one-letter prepositions and conjunctions to the next word: "ולחמאה".
const HEBREW_PREFIX = /^[והבלמשכ]/;

/** Candidate spellings of a typed ingredient: as typed, English singular, minus Hebrew prefixes. */
export function spellings(text: string): string[] {
  const raw = text.trim().toLowerCase();
  const out = [raw, singular(raw)];
  let word = raw;
  for (let i = 0; i < 2 && HEBREW_PREFIX.test(word) && word.length > 3; i++) {
    word = word.slice(1);
    out.push(word);
  }
  return [...new Set(out)];
}

/** Canonical name for what someone typed in any language, asking the LLM only as a last resort. */
export async function canonicalFor(text: string): Promise<string | null> {
  const forms = spellings(text);
  const { rows } = await db().execute<{ name: string }>(sql`
    select name from ingredients
    where name in ${forms}
       or exists (
         select 1 from jsonb_each(names) as l(code, list), jsonb_array_elements_text(l.list) as n
         where lower(n) in ${forms})
    order by length(name)
    limit 1`);
  if (rows[0]) return rows[0].name;
  if (/^[\x00-\x7f]*$/.test(text)) return null; // English that we don't know yet
  return canonicalIngredient(text).catch(() => null);
}
