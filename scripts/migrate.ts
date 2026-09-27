// Applies drizzle/ migrations to DATABASE_URL. Runs automatically before `next build` on Vercel.
import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { migrate as migrateNeon } from "drizzle-orm/neon-http/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  console.log("DATABASE_URL not set; skipping migrations.");
  process.exit(0);
}
const url = process.env.DATABASE_URL;
if (/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  const pool = new pg.Pool({ connectionString: url });
  await migratePg(drizzlePg(pool), { migrationsFolder: "drizzle" });
  await pool.end();
} else {
  await migrateNeon(drizzleNeon(neon(url)), { migrationsFolder: "drizzle" });
}
console.log("Database is up to date.");
