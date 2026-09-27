"use server";

import { put } from "@vercel/blob";
import { checkBotId } from "botid/server";
import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { db, recipes, sources, users } from "@/db";
import { suggestSubstitutes } from "@/lib/ai/substitute";
import {
  checkCredentials,
  createUser,
  getSession,
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
import { isLocale, LOCALE_COOKIE, type Locale } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { ingest, NotARecipeError, restructureRecipe, type IngestRequest } from "@/lib/ingest";
import { findUrl } from "@/lib/ingest/url";
import { clientIp, isRateLimited } from "@/lib/rate-limit";
import { COURSES, CUISINES, DIETS, SEASONS, type Substitution } from "@/lib/recipe-types";
import { notifyOwner } from "@/lib/telegram";
import { ensureTranslations } from "@/lib/translations";

// `values` echoes non-secret fields so a failed submit doesn't make people retype them.
export type FormState = { error?: string; ok?: string; values?: Record<string, string> } | undefined;

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
  const t = await getT();

  if (await isBot()) return { error: t("err.accessDenied"), values: { username } };
  const ip = await clientIp();
  if ((await isRateLimited(`login:ip:${ip}`, 20, 15 * 60)) || (await isRateLimited(`login:user:${username}`, 8, 15 * 60))) {
    return { error: t("err.tooManyLogins"), values: { username } };
  }

  if (!(await hasAnyUser())) {
    // First run: only the configured owner can claim the book.
    if (username !== OWNER_USERNAME) return { error: t("err.badLogin"), values: { username } };
    const problem = passwordProblem(password);
    if (problem) return { error: t(problem), values: { username } };
    await startSession(
      await createUser({ username, password, isAdmin: true, status: "approved", locale: await getLocale() }),
    );
  } else {
    const user = await checkCredentials(username, password);
    if (!user || user.status === "declined") return { error: t("err.badLogin"), values: { username } };
    if (user.status === "pending") return { error: t("err.pending"), values: { username } };
    await startSession(user);
  }
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function register(_: FormState, form: FormData): Promise<FormState> {
  const username = normalizeUsername(String(form.get("username") ?? ""));
  const password = String(form.get("password") ?? "");
  const displayName = String(form.get("displayName") ?? "").slice(0, 60);
  const note = String(form.get("note") ?? "").slice(0, 300);
  const t = await getT();

  const values = { username, displayName, note };
  if (await isBot()) return { error: t("err.accessDenied"), values };
  if (await isRateLimited(`register:ip:${await clientIp()}`, 5, 60 * 60)) {
    return { error: t("err.tooManyRequests"), values };
  }
  if (!(await hasAnyUser())) return { error: t("err.notSetUp"), values };
  if (!validUsername(username)) return { error: t("err.username"), values };
  const problem = passwordProblem(password);
  if (problem) return { error: t(problem), values };

  try {
    // They keep the language they asked in.
    await createUser({ username, password, displayName, requestNote: note, status: "pending", locale: t.locale });
  } catch {
    return { error: t("err.taken"), values };
  }
  await notifyOwner((ot) => `${ot("people.notify", { who: `${displayName || username} (@${username})` })}${note ? `\n“${note}”` : ""}`);
  return { ok: t("register.thanks") };
}

export async function logout() {
  await endSession();
  redirect("/login");
}

export async function changePassword(_: FormState, form: FormData): Promise<FormState> {
  const session = await requireSession();
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  const t = await getT();
  const problem = passwordProblem(next);
  if (problem) return { error: t(problem) };
  if (await isRateLimited(`password:${session.userId}`, 5, 15 * 60)) return { error: t("err.tryLater") };
  if (!(await checkCredentials(session.username, current))) return { error: t("err.currentPassword") };
  // Bumping the version signs out every other device.
  const [user] = await db()
    .update(users)
    .set({ passwordHash: await hashPassword(next), sessionVersion: sql`${users.sessionVersion} + 1` })
    .where(eq(users.id, session.userId))
    .returning();
  await startSession(user);
  return { ok: t("password.changed") };
}

// ---------- profile ----------

export async function updateProfile(_: FormState, form: FormData): Promise<FormState> {
  const session = await requireSession();
  const displayName = String(form.get("displayName") ?? "").trim().slice(0, 60);
  const t = await getT();
  if (!displayName) return { error: t("err.nameEmpty") };
  await db().update(users).set({ displayName }).where(eq(users.id, session.userId));
  revalidatePath("/", "layout");
  return { ok: t("common.saved") };
}

/**
 * Switch the app language. Remembered on this device (for the sign-in and share pages)
 * and on the profile, so it follows the person to their other devices and to Telegram.
 */
export async function setLanguage(locale: Locale) {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 365 * 24 * 60 * 60,
  });
  const session = await getSession();
  if (session) await db().update(users).set({ locale }).where(eq(users.id, session.userId));
  revalidatePath("/", "layout");
}

export async function updateAvatar(form: FormData) {
  const session = await requireSession();
  const file = form.get("avatar");
  if (!(file instanceof File) || file.size === 0 || !file.type.startsWith("image/")) return;
  if (file.size > 2_000_000) throw new Error("That picture is too large.");
  const blob = await put(`avatars/${session.userId}.jpg`, file, {
    access: "public",
    addRandomSuffix: true,
    contentType: file.type,
  });
  await db().update(users).set({ avatarUrl: blob.url }).where(eq(users.id, session.userId));
  revalidatePath("/", "layout");
}

export async function removeAvatar() {
  const session = await requireSession();
  await db().update(users).set({ avatarUrl: null }).where(eq(users.id, session.userId));
  revalidatePath("/", "layout");
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
  const target = await db().query.users.findFirst({ where: and(eq(users.id, userId), ne(users.isAdmin, true)) });
  if (!target) return;
  // Their recipes stay in the book, just without an uploader.
  await db().update(recipes).set({ createdBy: null }).where(eq(recipes.createdBy, userId));
  await db().update(sources).set({ createdBy: null }).where(eq(sources.createdBy, userId));
  await db().delete(users).where(eq(users.id, userId));
  revalidatePath("/settings");
}

// ---------- import ----------

export async function importRecipe(_: FormState, form: FormData): Promise<FormState> {
  const session = await requireSession();
  const t = await getT();
  if (await isRateLimited(`import:${session.userId}`, 30, 60 * 60)) {
    return { error: t("err.importLimit") };
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
    return { error: t("err.importEmpty") };
  }

  let id: string;
  try {
    ({ recipeId: id } = await ingest(req, session.userId));
  } catch (err) {
    console.error("import failed", err);
    if (err instanceof NotARecipeError) return { error: t("err.notRecipe") };
    return { error: t("err.importFailed", { reason: err instanceof Error ? err.message : t("err.unknown") }) };
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

// Anyone signed in can keep notes and add photos; editing and deletion belong to the
// person who added the recipe (or the owner).

export async function saveNotes(id: string, notes: string) {
  await requireSession();
  await db()
    .update(recipes)
    .set({ notes: notes.slice(0, 5000), updatedAt: new Date() })
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

const oneOf = <T extends string>(list: readonly T[], value: FormDataEntryValue | null, fallback: T): T =>
  list.includes(value as T) ? (value as T) : fallback;

const minutes = (v: FormDataEntryValue | null) => {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) && n > 0 && n < 100_000 ? n : null;
};

/**
 * Edit a recipe. Details save as typed; if the ingredients or method text changed, the
 * recipe is re-read by the LLM so every view (effective, ratios, units, search) stays right.
 */
export async function updateRecipe(id: string, _: FormState, form: FormData): Promise<FormState> {
  const { allowed } = await editableRecipe(id);
  const t = await getT();
  if (!allowed) return { error: t("err.onlyOwnerEdits") };
  const current = await db().query.recipes.findFirst({ where: eq(recipes.id, id) });
  if (!current) return { error: t("err.recipeNotFound") };

  const title = String(form.get("title") ?? "").trim().slice(0, 200);
  if (!title) return { error: t("err.titleEmpty") };
  // Browsers submit textareas with \r\n line breaks.
  const text = (name: string) => String(form.get(name) ?? "").replace(/\r\n?/g, "\n").trim();
  const ingredientsText = text("ingredients");
  const methodText = text("method");

  await db()
    .update(recipes)
    .set({
      title,
      description: String(form.get("description") ?? "").trim().slice(0, 1000) || null,
      servings: String(form.get("servings") ?? "").trim().slice(0, 60) || null,
      prepMinutes: minutes(form.get("prepMinutes")),
      cookMinutes: minutes(form.get("cookMinutes")),
      totalMinutes: minutes(form.get("totalMinutes")),
      cuisine: oneOf(CUISINES, form.get("cuisine"), current.cuisine as (typeof CUISINES)[number]),
      course: oneOf(COURSES, form.get("course"), current.course as (typeof COURSES)[number]),
      season: oneOf(SEASONS, form.get("season"), current.season as (typeof SEASONS)[number]),
      diet: form.getAll("diet").filter((d): d is (typeof DIETS)[number] => DIETS.includes(d as never)),
      notes: String(form.get("notes") ?? "").trim().slice(0, 5000) || null,
      updatedAt: new Date(),
    })
    .where(eq(recipes.id, id));

  const contentChanged =
    ingredientsText !== current.ingredients.map((i) => i.original).join("\n").trim() ||
    methodText !== current.steps.map((s) => s.text).join("\n\n").trim();
  if (contentChanged) {
    if (!ingredientsText || !methodText) return { error: t("err.contentEmpty") };
    try {
      await restructureRecipe(id, { title, ingredients: ingredientsText, method: methodText });
    } catch (err) {
      console.error("re-reading recipe failed", err);
      return { error: t("err.rereadFailed") };
    }
  }
  // Changed words make the other languages stale; redo them after the page is back.
  after(() => ensureTranslations(id));
  revalidatePath(`/recipes/${id}`);
  revalidatePath("/profile");
  redirect(`/recipes/${id}`);
}

export async function deleteRecipe(id: string, back: "/" | "/profile" = "/") {
  const { allowed } = await editableRecipe(id);
  if (!allowed) throw new Error("Only whoever added this recipe can delete it.");
  // Parked duplicates of this recipe have nothing left to compare with.
  await db().update(recipes).set({ duplicateOf: null }).where(eq(recipes.duplicateOf, id));
  await db().delete(recipes).where(eq(recipes.id, id));
  revalidatePath("/");
  revalidatePath("/profile");
  redirect(back);
}

// ---------- ingredient-first ----------

/** "Don't have it?" for one ingredient line in one recipe. */
export async function substituteInRecipe(recipeId: string, index: number): Promise<Substitution> {
  const session = await requireSession();
  if (await isRateLimited(`swap:${session.userId}`, 60, 60 * 60)) throw new Error("Too many requests, try later.");
  const locale = await getLocale();
  const r = await db().query.recipes.findFirst({ where: eq(recipes.id, recipeId) });
  const ing = r?.ingredients[index];
  if (!r || !ing) throw new Error("Ingredient not found");
  const word = ing.name.toLowerCase();
  return suggestSubstitutes(ing.canonical, locale, {
    recipeId,
    recipeTitle: r.titleEnglish,
    line: ing.original,
    usedIn: r.steps.map((s) => s.text).filter((t) => t.toLowerCase().includes(word.split(" ").pop() ?? word)),
  });
}
