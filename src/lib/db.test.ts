// Integration test for the search SQL against a real Postgres + pgvector.
// Runs only when TEST_DATABASE_URL points at a migrated, disposable database.
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";

const url = process.env.TEST_DATABASE_URL;
const pool = url ? new pg.Pool({ connectionString: url }) : null;
const testDb = pool ? drizzle(pool, { schema }) : null;

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/db", async () => ({ ...(await import("@/db/schema")), db: () => testDb }));
// Deterministic "embeddings": a one-hot vector per concept.
vi.mock("@/lib/ai/extract", () => ({
  embedText: async (q: string) => {
    const v = new Array(768).fill(0);
    v[/lemon|citrus/i.test(q) ? 1 : /tart|pastry/i.test(q) ? 2 : 3] = 1;
    return v;
  },
}));

const { searchRecipes } = await import("./search");
const { linkIngredients } = await import("./ingredient-links");
const { findDuplicate, resolveDuplicate } = await import("./dedupe");
const { goesWellWith, recipesUsingMost, resolveIngredient } = await import("./ingredients");
const { isRateLimited } = await import("./rate-limit");

const oneHot = (i: number) => Array.from({ length: 768 }, (_, k) => (k === i ? 1 : 0));

const ing = (canonical: string, grams: number | null = 100) => ({
  group: null, name: canonical, canonical, original: canonical, quantity: null, unit: null,
  grams, ml: null, volume: null, metric: grams ? `${grams} g` : null, note: null, optional: false,
});

async function addRecipe(title: string, ingredients: string[], dim: number, tags: string[] = [], grams: Record<string, number> = {}) {
  const [r] = await testDb!
    .insert(schema.recipes)
    .values({
      title,
      titleEnglish: title,
      ingredients: ingredients.map((c) => ing(c, grams[c] ?? 100)),
      steps: [],
      cuisine: "french",
      course: "main",
      season: "autumn",
      tags,
      shareToken: `t-${title}-${Math.random().toString(36).slice(2, 8)}`,
      embedding: oneHot(dim),
    })
    .returning({ id: schema.recipes.id });
  await linkIngredients(
    r.id,
    ingredients.map((canonical) => ({ canonical, optional: canonical === "chive" })),
  );
  return r.id;
}

describe.skipIf(!url)("search (database)", () => {
  beforeAll(async () => {
    await pool!.query("truncate recipes, ingredients, recipe_ingredients, rate_limits cascade");
    await addRecipe("Leek and feta tart", ["leek", "egg", "feta cheese", "flour", "butter", "chive"], 2, ["pastry"], {
      leek: 450,
    });
    await addRecipe("Leek soup", ["leek", "potato", "butter", "stock"], 4, [], { leek: 900 });
    await addRecipe("Lemon roast chicken", ["chicken", "lemon", "garlic"], 1, ["roast"]);
    await addRecipe("Shakshuka", ["egg", "tomato", "green onion", "feta cheese"], 3);
  });
  afterAll(async () => pool?.end());

  it("ranks pantry matches and counts what is missing", async () => {
    const [top] = await searchRecipes("I have leeks, eggs and feta cheese");
    expect(top.title).toBe("Leek and feta tart");
    expect(top.match?.have).toEqual(["egg", "feta cheese", "leek"]);
    expect(top.match?.missing).toBe(2); // flour, butter; chive is optional
  });

  it("matches multi-word ingredients from plurals", async () => {
    const results = await searchRecipes("green onions and tomatoes");
    expect(results[0].title).toBe("Shakshuka");
  });

  it("finds by vague meaning", async () => {
    const results = await searchRecipes("that citrusy thing");
    expect(results[0].title).toBe("Lemon roast chicken");
  });

  it("finds by title words", async () => {
    const results = await searchRecipes("shakshuka");
    expect(results[0].title).toBe("Shakshuka");
  });

  it("ranks recipes by how much of an ingredient they use", async () => {
    expect(await resolveIngredient("Leeks")).toBe("leek");
    const uses = await recipesUsingMost("leek");
    expect(uses.map((u) => u.title)).toEqual(["Leek soup", "Leek and feta tart"]);
    expect(uses[0].grams).toBe(900);
    const pairs = await goesWellWith("leek");
    expect(pairs[0]).toEqual({ name: "butter", count: 2 });
  });

  it("spots a duplicate import and resolves each choice", async () => {
    const actor = { userId: "00000000-0000-0000-0000-000000000000", isAdmin: true };
    const original = (await searchRecipes("shakshuka"))[0];
    await pool!.query("update recipes set notes = 'family favourite' where id = $1", [original.id]);
    const token = (await pool!.query("select share_token from recipes where id = $1", [original.id])).rows[0].share_token;

    const again = () => addRecipe("Shakshuka", ["egg", "tomato", "green onion", "feta cheese", "cumin"], 3);
    const a = await again();
    const match = await findDuplicate(a);
    expect(match?.id).toBe(original.id);
    await pool!.query("update recipes set duplicate_of = $2 where id = $1", [a, original.id]);
    const ids = (await searchRecipes("shakshuka")).map((r) => r.id);
    expect(ids[0]).toBe(original.id);
    expect(ids).not.toContain(a); // parked stays hidden

    expect(await resolveDuplicate(a, "keep-original", actor)).toBe(original.id);
    expect((await pool!.query("select 1 from recipes where id = $1", [a])).rowCount).toBe(0);

    const b = await again();
    await pool!.query("update recipes set duplicate_of = $2 where id = $1", [b, original.id]);
    expect(await resolveDuplicate(b, "replace", actor)).toBe(original.id);
    const replaced = await pool!.query("select notes, share_token, ingredients from recipes where id = $1", [original.id]);
    expect(replaced.rows[0].notes).toBe("family favourite");
    expect(replaced.rows[0].share_token).toBe(token);
    expect(replaced.rows[0].ingredients.map((i: { canonical: string }) => i.canonical)).toContain("cumin");

    const c = await again();
    await pool!.query("update recipes set duplicate_of = $2 where id = $1", [c, original.id]);
    expect(await resolveDuplicate(c, "keep-both", actor)).toBe(c);
    expect((await searchRecipes("shakshuka")).map((r) => r.id)).toContain(c);
  });

  it("does not call different dishes duplicates", async () => {
    const id = await addRecipe("Lemon tart", ["lemon", "egg", "sugar", "butter", "flour"], 5);
    expect(await findDuplicate(id)).toBeNull();
  });

  it("rate limits after the allowed count", async () => {
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await isRateLimited("test:key", 3, 60));
    expect(results).toEqual([false, false, false, true]);
  });

  it("re-linking replaces ingredients", async () => {
    const [{ id }] = await testDb!.select({ id: schema.recipes.id }).from(schema.recipes).limit(1);
    await linkIngredients(id, [{ canonical: "Rice", optional: false }, { canonical: "rice", optional: true }]);
    const rows = await pool!.query(
      "select i.name, ri.optional from recipe_ingredients ri join ingredients i on i.id = ri.ingredient_id where recipe_id = $1",
      [id],
    );
    expect(rows.rows).toEqual([{ name: "rice", optional: false }]);
  });
});
