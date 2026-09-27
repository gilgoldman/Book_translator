"use server";

import { put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, recipes, users } from "@/db";
import {
  checkCredentials,
  createUser,
  endSession,
  hashPassword,
  hasAnyUser,
  requireSession,
  startSession,
} from "@/lib/auth";
import { ingest, NotARecipeError, type IngestRequest } from "@/lib/ingest";
import { findUrl } from "@/lib/ingest/url";

export type FormState = { error?: string; ok?: string } | undefined;

// ---------- auth ----------

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const username = String(form.get("username") ?? "");
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/");

  if (!(await hasAnyUser())) {
    // First run: the first person to sign in creates the admin account.
    if (username.trim().length < 2 || password.length < 8) {
      return { error: "Choose a username and a password of at least 8 characters." };
    }
    await startSession(await createUser({ username, password, isAdmin: true }));
  } else {
    const user = await checkCredentials(username, password);
    if (!user) return { error: "That username and password don't match." };
    await startSession(user);
  }
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  await endSession();
  redirect("/login");
}

export async function addPerson(_: FormState, form: FormData): Promise<FormState> {
  const session = await requireSession();
  if (!session.isAdmin) return { error: "Only the cookbook owner can add people." };
  const username = String(form.get("username") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (username.length < 2 || password.length < 8) {
    return { error: "Username needs 2+ characters, password 8+." };
  }
  try {
    await createUser({ username, password, displayName: String(form.get("displayName") ?? "") });
  } catch {
    return { error: "That username is taken." };
  }
  revalidatePath("/settings");
  return { ok: `Added ${username}.` };
}

export async function changePassword(_: FormState, form: FormData): Promise<FormState> {
  const session = await requireSession();
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  if (next.length < 8) return { error: "The new password needs 8+ characters." };
  if (!(await checkCredentials(session.username, current))) return { error: "Current password is wrong." };
  await db()
    .update(users)
    .set({ passwordHash: await hashPassword(next) })
    .where(eq(users.id, session.userId));
  return { ok: "Password changed." };
}

// ---------- import ----------

export async function importRecipe(_: FormState, form: FormData): Promise<FormState> {
  const session = await requireSession();
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
    id = await ingest(req, session.userId);
  } catch (err) {
    console.error("import failed", err);
    if (err instanceof NotARecipeError) return { error: err.message };
    return { error: `Import failed: ${err instanceof Error ? err.message : "unknown error"}` };
  }
  revalidatePath("/");
  redirect(`/recipes/${id}`);
}

// ---------- recipe extras ----------

export async function saveNotes(id: string, notes: string) {
  await requireSession();
  await db().update(recipes).set({ notes, updatedAt: new Date() }).where(eq(recipes.id, id));
  revalidatePath(`/recipes/${id}`);
}

export async function saveTags(
  id: string,
  tags: { cuisine: string; course: string; season: string; diet: string[] },
) {
  await requireSession();
  await db()
    .update(recipes)
    .set({ ...tags, updatedAt: new Date() })
    .where(eq(recipes.id, id));
  revalidatePath(`/recipes/${id}`);
}

export async function addPhoto(id: string, form: FormData) {
  await requireSession();
  const file = form.get("photo");
  if (!(file instanceof File) || file.size === 0) return;
  const blob = await put(`photos/${id}/${file.name || "photo.jpg"}`, file, {
    access: "public",
    addRandomSuffix: true,
    contentType: file.type,
  });
  const recipe = await db().query.recipes.findFirst({ where: eq(recipes.id, id), columns: { photos: true } });
  if (!recipe) return;
  // Your own photo goes first: it becomes the cover.
  await db()
    .update(recipes)
    .set({ photos: [blob.url, ...recipe.photos], updatedAt: new Date() })
    .where(eq(recipes.id, id));
  revalidatePath(`/recipes/${id}`);
}

export async function deleteRecipe(id: string) {
  await requireSession();
  await db().delete(recipes).where(eq(recipes.id, id));
  revalidatePath("/");
  redirect("/");
}
