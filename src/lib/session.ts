import { jwtVerify, SignJWT } from "jose";

// Edge-safe session helpers (used by proxy.ts and server code alike).

export const SESSION_COOKIE = "cookbook_session";
export const SESSION_DAYS = 90;

export type SessionPayload = { userId: string; username: string; isAdmin: boolean };

function key() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET must be set (32+ chars)");
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(key());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (typeof payload.userId !== "string" || typeof payload.username !== "string") return null;
    return { userId: payload.userId, username: payload.username, isAdmin: payload.isAdmin === true };
  } catch {
    return null;
  }
}
