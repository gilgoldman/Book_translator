import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

function createDb() {
  // Neon's Vercel integration sets both; POSTGRES_URL covers older setups.
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. On Vercel, env vars reach only deployments made after they were added: redeploy.",
    );
  }
  // A plain local Postgres for development; Neon's HTTP driver everywhere else.
  if (/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
    return drizzlePg(new pg.Pool({ connectionString: url }), { schema }) as unknown as ReturnType<typeof neonDb>;
  }
  return neonDb(url);
}

const neonDb = (url: string) => drizzleNeon(neon(url), { schema });

let instance: ReturnType<typeof createDb> | undefined;

// Lazy so `next build` works without a database.
export function db() {
  instance ??= createDb();
  return instance;
}

export * from "./schema";
