import "server-only";
import bcrypt from "bcryptjs";
import { count, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, users, type User } from "@/db";
import { SESSION_COOKIE, SESSION_DAYS, signSession, verifySession, type SessionPayload } from "./session";

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export async function checkCredentials(username: string, password: string): Promise<User | null> {
  const user = await db().query.users.findFirst({ where: eq(users.username, normalizeUsername(username)) });
  if (!user) {
    await bcrypt.hash(password, 10); // even out timing
    return null;
  }
  return (await bcrypt.compare(password, user.passwordHash)) ? user : null;
}

export async function hasAnyUser() {
  const [{ n }] = await db().select({ n: count() }).from(users);
  return n > 0;
}

export async function createUser(input: {
  username: string;
  password: string;
  displayName?: string;
  isAdmin?: boolean;
}): Promise<User> {
  const [user] = await db()
    .insert(users)
    .values({
      username: normalizeUsername(input.username),
      displayName: input.displayName?.trim() || null,
      passwordHash: await hashPassword(input.password),
      isAdmin: input.isAdmin ?? false,
    })
    .returning();
  return user;
}

export async function startSession(user: User) {
  const token = await signSession({ userId: user.id, username: user.username, isAdmin: user.isAdmin });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value);
}

/** For pages and server actions: the proxy already redirects, this is the second lock. */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
