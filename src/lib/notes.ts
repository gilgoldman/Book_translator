import "server-only";
import { asc, eq } from "drizzle-orm";
import { db, recipeNotes, users } from "@/db";

export type RecipeNote = {
  id: string;
  userId: string | null;
  text: string;
  photos: string[];
  createdAt: Date;
  by: { username: string; name: string; avatar: string | null } | null;
};

/** A recipe's notes, oldest first, with who wrote each. */
export async function listNotes(recipeId: string): Promise<RecipeNote[]> {
  const rows = await db()
    .select({
      id: recipeNotes.id,
      userId: recipeNotes.userId,
      text: recipeNotes.text,
      photos: recipeNotes.photos,
      createdAt: recipeNotes.createdAt,
      username: users.username,
      displayName: users.displayName,
      avatar: users.avatarUrl,
    })
    .from(recipeNotes)
    .leftJoin(users, eq(users.id, recipeNotes.userId))
    .where(eq(recipeNotes.recipeId, recipeId))
    .orderBy(asc(recipeNotes.createdAt));
  return rows.map(({ username, displayName, avatar, ...n }) => ({
    ...n,
    by: username ? { username, name: displayName || username, avatar } : null,
  }));
}

/** Whoever wrote a note can delete it; so can whoever added the recipe, and the owner. */
export function canDeleteNote(
  note: { userId: string | null },
  recipeEditable: boolean,
  actor: { userId: string },
): boolean {
  return recipeEditable || note.userId === actor.userId;
}
