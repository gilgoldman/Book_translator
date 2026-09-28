import "server-only";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";

/**
 * Fixed-window counter in Postgres. Works on any plan and survives cold starts;
 * the Vercel WAF rule described in the README sits in front of it.
 * Returns true when the caller is over the limit.
 */
export async function isRateLimited(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const { rows } = await db().execute<{ count: number }>(sql`
    insert into rate_limits (key, count, window_start) values (${key}, 1, now())
    on conflict (key) do update set
      count = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds})
                   then 1 else rate_limits.count + 1 end,
      window_start = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds})
                   then now() else rate_limits.window_start end
    returning count`);
  return Number(rows[0]?.count ?? 0) > limit;
}

/**
 * True for the first caller in a window, false for everyone else until it ends or the
 * work is released: a light lock for background work. Not releasing it after a failure
 * spaces out the retries.
 */
export async function claim(key: string, seconds: number): Promise<boolean> {
  return !(await isRateLimited(key, 1, seconds));
}

export async function release(key: string) {
  await db().execute(sql`delete from rate_limits where key = ${key}`);
}

/** Drops counters whose window ended long ago (no window here is longer than an hour). */
export async function pruneRateLimits() {
  await db().execute(sql`delete from rate_limits where window_start < now() - interval '1 day'`);
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  // On Vercel, x-real-ip / the first x-forwarded-for entry is set by the edge and not spoofable.
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}
