import "server-only";
import bcrypt from "bcryptjs";
import { count, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db, users, type User } from "@/db";
import { SESSION_COOKIE, SESSION_DAYS, signSession, verifySession } from "./session";

const BCRYPT_COST = 12;
// Unknown usernames are compared against this so they cost the same time as wrong passwords.
let dummyHash: Promise<string> | undefined;

export const OWNER_USERNAME = normalizeUsername(process.env.OWNER_USERNAME ?? "gilgoldman");

export type Session = { userId: string; username: string; isAdmin: boolean };

export function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export function validUsername(username: string) {
  return /^[a-z0-9._-]{2,32}$/.test(normalizeUsername(username));
}

export function passwordProblem(password: string): string | null {
  if (password.length < 10) return "Use at least 10 characters.";
  if (password.length > 200) return "That password is too long.";
  return null;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_COST);
}

/** Returns the user only if the password matches; status is checked by the caller. */
export async function checkCredentials(username: string, password: string): Promise<User | null> {
  const user = await db().query.users.findFirst({ where: eq(users.username, normalizeUsername(username)) });
  dummyHash ??= bcrypt.hash("timing-equaliser", BCRYPT_COST);
  const ok = await bcrypt.compare(password, user?.passwordHash ?? (await dummyHash));
  return user && ok ? user : null;
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
  status?: User["status"];
  requestNote?: string;
}): Promise<User> {
  const [user] = await db()
    .insert(users)
    .values({
      username: normalizeUsername(input.username),
      displayName: input.displayName?.trim() || null,
      passwordHash: await hashPassword(input.password),
      isAdmin: input.isAdmin ?? false,
      status: input.status ?? "pending",
      requestNote: input.requestNote?.trim() || null,
    })
    .returning();
  return user;
}

export async function startSession(user: User) {
  const token = await signSession({
    userId: user.id,
    username: user.username,
    isAdmin: user.isAdmin,
    v: user.sessionVersion,
  });
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

/** Valid signature AND the account is still approved AND the session hasn't been revoked. */
export const getSession = cache(async (): Promise<Session | null> => {
  const payload = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!payload) return null;
  const user = await db().query.users.findFirst({ where: eq(users.id, payload.userId) });
  if (!user || user.status !== "approved" || user.sessionVersion !== payload.v) return null;
  return { userId: user.id, username: user.username, isAdmin: user.isAdmin };
});

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireAdmin(): Promise<Session> {
  const session = await requireSession();
  if (!session.isAdmin) redirect("/");
  return session;
}
