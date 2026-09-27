import { jwtVerify, SignJWT } from "jose";

// Edge-safe session helpers (used by proxy.ts and server code alike). The proxy only
// checks the signature; server code also checks the user is still approved and the
// session version is current (see getSession in auth.ts).

// __Host- cookies must be Secure, host-only and path=/: no subdomain can set or read them.
export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-cookbook" : "cookbook_session";
export const SESSION_DAYS = 60;

export type SessionPayload = { userId: string; username: string; isAdmin: boolean; v: number };

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
    return {
      userId: payload.userId,
      username: payload.username,
      isAdmin: payload.isAdmin === true,
      v: typeof payload.v === "number" ? payload.v : -1,
    };
  } catch {
    return null;
  }
}
