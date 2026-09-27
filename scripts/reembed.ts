// Recomputes every recipe embedding. Needed after changing the embedding model.
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, recipes } from "../src/db";
import { embeddingText, embedText } from "../src/lib/ai/extract";

const all = await db().select().from(recipes);
for (const r of all) {
  await db()
    .update(recipes)
    .set({ embedding: await embedText(embeddingText(r)) })
    .where(eq(recipes.id, r.id));
  console.log("✓", r.titleEnglish);
}
console.log(`Re-embedded ${all.length} recipes.`);
