// ONE-OFF, REMOVE IN THE NEXT PR: loads Mom's cookbook into the database. See "One-off seed" in
// CLAUDE.md for everything to delete once the build log says "Seed: done".
//
// Imports the recipes in scripts/seed/*.json through the normal text pipeline (extract,
// enrich, embed, link ingredients, translate), filed under each file's `addedBy` user.
// Runs after every build on Vercel (the build has the database and Gemini key), within a
// time budget; whatever doesn't fit is picked up by the next build. A recipe whose text is
// already a source is skipped. Never fails the build. `npm run seed` does the same by hand.
//
// Seeds skip the duplicate check on purpose: family recipes with the same name
// (four semolina cakes…) are different versions, not re-imports.
import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import { and, eq, gt, inArray, or } from "drizzle-orm";
import { db, sources, users } from "../src/db";
import { NotARecipeError, processSource } from "../src/lib/ingest";
import { ensureTranslations } from "../src/lib/translations";

type SeedFile = { source: string; addedBy: string; recipes: { title: string; text: string }[] };

const CONCURRENCY = 4;
// Vercel stops a build at 45 minutes; leave room for the rest of it.
const BUDGET_MS = Number(process.env.SEED_BUDGET_MINUTES ?? 20) * 60_000;
// A source this young and still pending belongs to a build running right now.
const IN_PROGRESS_MS = 30 * 60_000;

const NOT_A_RECIPE = "seed: not a recipe";

const deadline = Date.now() + BUDGET_MS;
const dir = new URL("./seed/", import.meta.url);
let added = 0;
let skipped = 0;
let left = 0;
const failed: string[] = [];

try {
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
    console.log("Seed: no database configured, skipping.");
  } else if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    console.log("Seed: GOOGLE_GENERATIVE_AI_API_KEY not set, skipping.");
  } else {
    for (const file of (await readdir(dir)).filter((f) => f.endsWith(".json"))) {
      await seedFile(JSON.parse(await readFile(new URL(file, dir), "utf8")));
    }
    console.log(`Seed: added ${added}, already in ${skipped}, failed ${failed.length}, left for next build ${left}.`);
    if (failed.length) console.log(`Seed failures (retried next build):\n  ${failed.join("\n  ")}`);
    if (!failed.length && !left) {
      console.log("Seed: done. Every recipe is in; remove the one-off seed (see CLAUDE.md).");
    }
  }
} catch (err) {
  console.log("Seed: stopped, will retry next build:", err instanceof Error ? err.message : err);
}
process.exit(0);

async function seedFile(seed: SeedFile) {
  const [user] = await db().select({ id: users.id }).from(users).where(eq(users.username, seed.addedBy));
  if (!user) {
    console.log(`Seed: no user "${seed.addedBy}", skipping ${seed.source}.`);
    return;
  }
  const existing = await db()
    .select({ text: sources.text })
    .from(sources)
    .where(
      and(
        eq(sources.kind, "text"),
        inArray(
          sources.text,
          seed.recipes.map((r) => r.text),
        ),
        or(
          eq(sources.status, "done"),
          eq(sources.error, NOT_A_RECIPE),
          gt(sources.createdAt, new Date(Date.now() - IN_PROGRESS_MS)),
        ),
      ),
    );
  const have = new Set(existing.map((s) => s.text));
  const queue = seed.recipes.filter((r) => !have.has(r.text));
  skipped += seed.recipes.length - queue.length;
  console.log(`Seed: ${seed.source}: ${queue.length} of ${seed.recipes.length} to import.`);

  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length && Date.now() < deadline) await seedOne(queue.shift()!, user.id);
    }),
  );
  left += queue.length;
}

async function seedOne({ title, text }: { title: string; text: string }, userId: string) {
  const [source] = await db()
    .insert(sources)
    .values({ kind: "text", text, createdBy: userId })
    .returning({ id: sources.id });
  try {
    const { id } = await processSource(source.id, { kind: "text", text }, userId);
    await db().update(sources).set({ status: "done" }).where(eq(sources.id, source.id));
    added++;
    console.log("✓", title);
    // Recipes also translate themselves when first opened, so a failure here is not fatal.
    await ensureTranslations(id).catch((err) => console.log("  (translation later)", title, err?.message ?? err));
  } catch (err) {
    if (err instanceof NotARecipeError) {
      // Kept as failed so later builds don't ask again.
      await db().update(sources).set({ status: "failed", error: NOT_A_RECIPE }).where(eq(sources.id, source.id));
      console.log("–", title, "- not a recipe, skipped");
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    // The seed file holds the text; drop the source so the next build retries cleanly
    // (it stays, marked failed, if a recipe already points at it).
    await db()
      .delete(sources)
      .where(eq(sources.id, source.id))
      .catch(() => db().update(sources).set({ status: "failed", error: message }).where(eq(sources.id, source.id)));
    failed.push(`${title}: ${message}`);
    console.log("✗", title, "-", message);
  }
}
