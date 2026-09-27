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
const { linkIngredients } = await import("./ingest");

const oneHot = (i: number) => Array.from({ length: 768 }, (_, k) => (k === i ? 1 : 0));

async function addRecipe(title: string, ingredients: string[], dim: number, tags: string[] = []) {
  const [r] = await testDb!
    .insert(schema.recipes)
    .values({
      title,
      titleEnglish: title,
      ingredients: [],
      steps: [],
      cuisine: "french",
      course: "main",
      season: "autumn",
      tags,
      shareToken: `t-${title}`,
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
    await pool!.query("truncate recipes, ingredients, recipe_ingredients cascade");
    await addRecipe("Leek and feta tart", ["leek", "egg", "feta cheese", "flour", "butter", "chive"], 2, ["pastry"]);
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
