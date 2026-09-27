"use server";

import { put } from "@vercel/blob";
import { checkBotId } from "botid/server";
import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, recipes, users } from "@/db";
import { suggestSubstitutes } from "@/lib/ai/substitute";
import {
  checkCredentials,
  createUser,
  endSession,
  hashPassword,
  hasAnyUser,
  normalizeUsername,
  OWNER_USERNAME,
  passwordProblem,
  requireAdmin,
  requireSession,
  startSession,
  validUsername,
} from "@/lib/auth";
import { canEdit, resolveDuplicate, type DuplicateChoice } from "@/lib/dedupe";
import { ingest, NotARecipeError, type IngestRequest } from "@/lib/ingest";
import { findUrl } from "@/lib/ingest/url";
import { clientIp, isRateLimited } from "@/lib/rate-limit";
import type { Substitution } from "@/lib/recipe-types";
import { notifyOwner } from "@/lib/telegram";

// `values` echoes non-secret fields so a failed submit doesn't make people retype them.
export type FormState = { error?: string; ok?: string; values?: Record<string, string> } | undefined;

const GENERIC_LOGIN_ERROR = "That username and password don't match.";

async function isBot() {
  // Invisible Vercel BotID challenge (see instrumentation-client.ts). Only on Vercel.
  if (!process.env.VERCEL) return false;
  const { isBot } = await checkBotId();
  return isBot;
}

// ---------- auth ----------

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const username = normalizeUsername(String(form.get("username") ?? ""));
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/");

  if (await isBot()) return { error: "Access denied.", values: { username } };
  const ip = await clientIp();
  if ((await isRateLimited(`login:ip:${ip}`, 20, 15 * 60)) || (await isRateLimited(`login:user:${username}`, 8, 15 * 60))) {
    return { error: "Too many attempts. Please wait 15 minutes and try again.", values: { username } };
  }

  if (!(await hasAnyUser())) {
    // First run: only the configured owner can claim the book.
    if (username !== OWNER_USERNAME) return { error: GENERIC_LOGIN_ERROR, values: { username } };
    const problem = passwordProblem(password);
    if (problem) return { error: problem, values: { username } };
    await startSession(await createUser({ username, password, isAdmin: true, status: "approved" }));
  } else {
    const user = await checkCredentials(username, password);
    if (!user || user.status === "declined") return { error: GENERIC_LOGIN_ERROR, values: { username } };
    if (user.status === "pending") return { error: "Your request is waiting for approval.", values: { username } };
    await startSession(user);
  }
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function register(_: FormState, form: FormData): Promise<FormState> {
  const username = normalizeUsername(String(form.get("username") ?? ""));
  const password = String(form.get("password") ?? "");
  const displayName = String(form.get("displayName") ?? "").slice(0, 60);
  const note = String(form.get("note") ?? "").slice(0, 300);

  const values = { username, displayName, note };
  if (await isBot()) return { error: "Access denied.", values };
  if (await isRateLimited(`register:ip:${await clientIp()}`, 5, 60 * 60)) {
    return { error: "Too many requests. Please try again later.", values };
  }
  if (!(await hasAnyUser())) return { error: "The cookbook isn't set up yet.", values };
  if (!validUsername(username)) return { error: "Usernames use 2–32 letters, numbers, dots, dashes or underscores.", values };
  const problem = passwordProblem(password);
  if (problem) return { error: problem, values };

  try {
    await createUser({ username, password, displayName, requestNote: note, status: "pending" });
  } catch {
    return { error: "That username is taken.", values };
  }
  await notifyOwner(`New access request: ${displayName || username} (@${username})${note ? `\n“${note}”` : ""}`);
  return { ok: "Thanks! You'll be able to sign in once your request is approved." };
}

export async function logout() {
  await endSession();
  redirect("/login");
}

export async function changePassword(_: FormState, form: FormData): Promise<FormState> {
  const session = await requireSession();
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  const problem = passwordProblem(next);
  if (problem) return { error: problem };
  if (await isRateLimited(`password:${session.userId}`, 5, 15 * 60)) return { error: "Too many attempts. Try later." };
  if (!(await checkCredentials(session.username, current))) return { error: "Current password is wrong." };
  // Bumping the version signs out every other device.
  const [user] = await db()
    .update(users)
    .set({ passwordHash: await hashPassword(next), sessionVersion: sql`${users.sessionVersion} + 1` })
    .where(eq(users.id, session.userId))
    .returning();
  await startSession(user);
  return { ok: "Password changed. Other devices have been signed out." };
}

// ---------- owner: people ----------

export async function setUserStatus(userId: string, status: "approved" | "declined") {
  const owner = await requireAdmin();
  if (userId === owner.userId) return;
  await db()
    .update(users)
    .set({ status, sessionVersion: sql`${users.sessionVersion} + 1` })
    .where(and(eq(users.id, userId), eq(users.isAdmin, false)));
  revalidatePath("/settings");
}

export async function removeUser(userId: string) {
  const owner = await requireAdmin();
  if (userId === owner.userId) return;
  await db().delete(users).where(and(eq(users.id, userId), ne(users.isAdmin, true)));
  revalidatePath("/settings");
}

// ---------- import ----------

export async function importRecipe(_: FormState, form: FormData): Promise<FormState> {
  const session = await requireSession();
  if (await isRateLimited(`import:${session.userId}`, 30, 60 * 60)) {
    return { error: "That's a lot of imports for one hour. Take a break and try again soon." };
  }
  const text = String(form.get("text") ?? "").trim();
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);

  let req: IngestRequest;
  if (files.length > 0) {
    const kind = files[0].type.startsWith("audio/") ? "audio" : "image";
    req = {
      kind,
      caption: text || undefined,
      files: await Promise.all(
        files.map(async (f) => ({
          data: new Uint8Array(await f.arrayBuffer()),
          mediaType: f.type || "application/octet-stream",
          name: f.name || (kind === "audio" ? "voice.webm" : "photo.jpg"),
        })),
      ),
    };
  } else if (text) {
    const url = findUrl(text);
    req = url && text.length < url.length + 40 ? { kind: "url", url } : { kind: "text", text };
  } else {
    return { error: "Add a link, some text, a photo or a voice note." };
  }

  let id: string;
  try {
    ({ recipeId: id } = await ingest(req, session.userId));
  } catch (err) {
    console.error("import failed", err);
    if (err instanceof NotARecipeError) return { error: err.message };
    return { error: `Import failed: ${err instanceof Error ? err.message : "unknown error"}` };
  }
  revalidatePath("/");
  // A parked duplicate shows the keep/replace prompt on its page.
  redirect(`/recipes/${id}`);
}

export async function decideDuplicate(newId: string, choice: DuplicateChoice) {
  const session = await requireSession();
  const id = await resolveDuplicate(newId, choice, session);
  revalidatePath("/");
  redirect(`/recipes/${id}`);
}

// ---------- recipe extras ----------

async function editableRecipe(id: string) {
  const session = await requireSession();
  const recipe = await db().query.recipes.findFirst({
    where: eq(recipes.id, id),
    columns: { id: true, createdBy: true, photos: true },
  });
  if (!recipe) throw new Error("Recipe not found");
  return { session, recipe, allowed: canEdit(recipe, session) };
}

// Anyone signed in can keep notes and add photos; tags and deletion belong to the
// person who added the recipe (or the owner).

export async function saveNotes(id: string, notes: string) {
  await requireSession();
  await db()
    .update(recipes)
    .set({ notes: notes.slice(0, 5000), updatedAt: new Date() })
    .where(eq(recipes.id, id));
  revalidatePath(`/recipes/${id}`);
}

export async function saveTags(id: string, tags: { cuisine: string; course: string; season: string; diet: string[] }) {
  const { allowed } = await editableRecipe(id);
  if (!allowed) throw new Error("Only whoever added this recipe can change its tags.");
  await db()
    .update(recipes)
    .set({ ...tags, updatedAt: new Date() })
    .where(eq(recipes.id, id));
  revalidatePath(`/recipes/${id}`);
}

export async function addPhoto(id: string, form: FormData) {
  const { recipe } = await editableRecipe(id);
  const file = form.get("photo");
  if (!(file instanceof File) || file.size === 0 || !file.type.startsWith("image/")) return;
  if (file.size > 4_000_000) throw new Error("That photo is too large.");
  const blob = await put(`photos/${id}/photo.jpg`, file, {
    access: "public",
    addRandomSuffix: true,
    contentType: file.type,
  });
  // Your own photo goes first: it becomes the cover.
  await db()
    .update(recipes)
    .set({ photos: [blob.url, ...recipe.photos], updatedAt: new Date() })
    .where(eq(recipes.id, id));
  revalidatePath(`/recipes/${id}`);
}

export async function deleteRecipe(id: string) {
  const { allowed } = await editableRecipe(id);
  if (!allowed) throw new Error("Only whoever added this recipe can delete it.");
  await db().delete(recipes).where(eq(recipes.id, id));
  revalidatePath("/");
  redirect("/");
}

// ---------- ingredient-first ----------

/** "Don't have it?" for one ingredient line in one recipe. */
export async function substituteInRecipe(recipeId: string, index: number): Promise<Substitution> {
  const session = await requireSession();
  if (await isRateLimited(`swap:${session.userId}`, 60, 60 * 60)) throw new Error("Too many requests, try later.");
  const r = await db().query.recipes.findFirst({ where: eq(recipes.id, recipeId) });
  const ing = r?.ingredients[index];
  if (!r || !ing) throw new Error("Ingredient not found");
  const word = ing.name.toLowerCase();
  return suggestSubstitutes(ing.canonical, {
    recipeId,
    recipeTitle: r.titleEnglish,
    line: ing.original,
    usedIn: r.steps.map((s) => s.text).filter((t) => t.toLowerCase().includes(word.split(" ").pop() ?? word)),
  });
}
