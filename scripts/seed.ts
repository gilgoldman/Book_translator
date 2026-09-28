// Imports the recipes in scripts/seed/*.json through the normal text pipeline (extract,
// enrich, embed, link ingredients, translate), filed under SEED_USERNAME (default: the owner). Safe to re-run: a
// recipe whose text is already a source is skipped, so an interrupted run just continues.
//
//   npm run seed                      every file in scripts/seed
//   npm run seed -- mom-cookbook      one file
//
// Seeds skip the duplicate check on purpose: family recipes with the same name
// (four semolina cakes…) are different versions, not re-imports.
import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import { db, sources, users } from "../src/db";
import { NotARecipeError, processSource } from "../src/lib/ingest";
import { ensureTranslations } from "../src/lib/translations";

type SeedFile = { source: string; recipes: { title: string; text: string }[] };

const CONCURRENCY = 4;
const dir = new URL("./seed/", import.meta.url);
const only = process.argv[2];

const username = process.env.SEED_USERNAME ?? process.env.OWNER_USERNAME ?? "gilgoldman";
const [user] = await db().select({ id: users.id }).from(users).where(eq(users.username, username));
if (!user) throw new Error(`No user "${username}": they need an account first.`);

const files = (await readdir(dir)).filter((f) => f.endsWith(".json") && (!only || f === `${only}.json`));
let added = 0;
let skipped = 0;
const failed: string[] = [];

for (const file of files) {
  const seed: SeedFile = JSON.parse(await readFile(new URL(file, dir), "utf8"));
  console.log(`${file}: ${seed.recipes.length} recipes from ${seed.source}`);
  const queue = [...seed.recipes];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let r = queue.shift(); r; r = queue.shift()) await seedOne(r);
    }),
  );
}

console.log(`Added ${added}, already there ${skipped}, failed ${failed.length}.`);
if (failed.length) console.log(`Failed (re-run to retry):\n  ${failed.join("\n  ")}`);
process.exit(failed.length ? 1 : 0);

async function seedOne({ title, text }: { title: string; text: string }) {
  const [done] = await db()
    .select({ id: sources.id })
    .from(sources)
    .where(and(eq(sources.kind, "text"), eq(sources.text, text), eq(sources.status, "done")));
  if (done) {
    skipped++;
    return;
  }
  const [source] = await db()
    .insert(sources)
    .values({ kind: "text", text, createdBy: user.id })
    .returning({ id: sources.id });
  try {
    const { id } = await processSource(source.id, { kind: "text", text }, user.id);
    await db().update(sources).set({ status: "done" }).where(eq(sources.id, source.id));
    await ensureTranslations(id);
    added++;
    console.log("✓", title);
  } catch (err) {
    const message = err instanceof NotARecipeError ? "not a recipe" : err instanceof Error ? err.message : String(err);
    await db().update(sources).set({ status: "failed", error: message }).where(eq(sources.id, source.id));
    failed.push(`${title}: ${message}`);
    console.log("✗", title, "-", message);
  }
}
