import { timingSafeEqual } from "node:crypto";
import { and, asc, eq, lt } from "drizzle-orm";
import { after } from "next/server";
import { db, pendingMedia, recipes, sources, users } from "@/db";
import { suggestSubstitutes } from "@/lib/ai/substitute";
import { checkCredentials } from "@/lib/auth";
import { resolveDuplicate } from "@/lib/dedupe";
import { ingredientDiff } from "@/lib/dedupe-rules";
import { ingest, NotARecipeError, type IncomingFile, type IngestRequest } from "@/lib/ingest";
import { parseIngredientIntent } from "@/lib/ingredient-intent";
import { goesWellWith, recipesUsingMost, resolveIngredient } from "@/lib/ingredients";
import { isRateLimited } from "@/lib/rate-limit";
import { searchRecipes } from "@/lib/search";
import { downloadFile, edit, send, tg, type TgMessage, type TgUpdate } from "@/lib/telegram";
import {
  classifyText,
  duplicateKeyboard,
  esc,
  parseCallback,
  parseDuplicateCallback,
  renderAbundance,
  renderDuplicatePrompt,
  renderRecipe,
  renderSubstitution,
  viewKeyboard,
  type TgView,
} from "@/lib/telegram-format";

export const maxDuration = 300;

const ALBUM_WAIT_MS = 2500;
const appUrl = () => process.env.APP_URL?.replace(/\/$/, "");

const HELP = `Send me anything and I'll file it in the cookbook:
· a photo or screenshot (albums = one recipe)
· a link to a recipe
· a voice note describing a recipe
· pasted recipe text

Or ask: <i>leeks, eggs, feta</i> or <i>that lemony chicken</i>.
<i>I have a lot of leeks</i> or /lots leeks — recipes that use the most.
<i>I don't have buttermilk</i> or /swap buttermilk — what to use instead.
/find … searches, /add … forces an import.`;

function secretMatches(given: string | null) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The approved user linked to this chat, if any. */
async function linkedUser(chatId: number) {
  return db().query.users.findFirst({
    where: and(eq(users.telegramChatId, chatId), eq(users.status, "approved")),
  });
}

export async function POST(request: Request) {
  if (!secretMatches(request.headers.get("x-telegram-bot-api-secret-token"))) {
    return new Response("forbidden", { status: 403 });
  }
  const update = (await request.json()) as TgUpdate;
  // Answer Telegram at once; the slow work runs after the response.
  after(() =>
    handle(update).catch((err) => {
      console.error("telegram update failed", err);
    }),
  );
  return Response.json({ ok: true });
}

async function handle(update: TgUpdate) {
  if (update.callback_query) return handleCallback(update.callback_query);
  const msg = update.message;
  if (!msg || msg.chat.type !== "private") return;

  const chatId = msg.chat.id;
  const text = (msg.text ?? "").trim();
  const intent = text ? classifyText(text) : null;

  if (intent?.kind === "login") {
    // Don't leave the password sitting in the chat.
    await tg("deleteMessage", { chat_id: chatId, message_id: msg.message_id }).catch(() => {});
    if (await isRateLimited(`tg-login:${chatId}`, 5, 15 * 60)) {
      return send(chatId, "Too many attempts. Please wait 15 minutes.");
    }
    const user = await checkCredentials(intent.username, intent.password);
    if (!user || user.status === "declined") return send(chatId, "That username and password don't match.");
    if (user.status === "pending") return send(chatId, "Your request is still waiting for approval.");
    await db().update(users).set({ telegramChatId: null }).where(eq(users.telegramChatId, chatId));
    await db().update(users).set({ telegramChatId: chatId }).where(eq(users.id, user.id));
    return send(chatId, `Hi ${esc(user.displayName ?? user.username)}, you're connected.\n\n${HELP}`);
  }

  const user = await linkedUser(chatId);
  if (!user) {
    return send(chatId, "Hello! This is a private cookbook. Connect with:\n<code>/login username password</code>");
  }
  if (intent?.kind === "start" || intent?.kind === "help") return send(chatId, HELP);

  // Media
  const media = pickMedia(msg);
  if (media) {
    if (msg.media_group_id) return collectAlbum(msg, media);
    return importAndReply(chatId, user.id, async () => ({
      kind: media.kind,
      caption: msg.caption,
      files: [await fetchFile(media.fileId, media.mediaType)],
    }));
  }

  if (!intent) return send(chatId, HELP);
  if (intent.kind === "url") return importAndReply(chatId, user.id, async () => ({ kind: "url", url: intent.url }));
  if (intent.kind === "import") return importAndReply(chatId, user.id, async () => ({ kind: "text", text: intent.text }));
  if (intent.kind === "search") {
    const ingredientIntent = parseIngredientIntent(intent.query);
    if (ingredientIntent?.kind === "abundance") return abundanceReply(chatId, ingredientIntent.ingredient);
    if (ingredientIntent?.kind === "substitute") return substituteReply(chatId, ingredientIntent.ingredient);
    return searchAndReply(chatId, intent.query);
  }
}

async function abundanceReply(chatId: number, text: string) {
  const name = await resolveIngredient(text);
  const [uses, pairs] = await Promise.all([recipesUsingMost(name, 8), goesWellWith(name, 8)]);
  return send(chatId, renderAbundance(name, uses, pairs), {
    reply_markup: uses.length
      ? { inline_keyboard: uses.map((u, i) => [{ text: `${i + 1}. ${u.title}`.slice(0, 60), callback_data: `o:${u.id}` }]) }
      : undefined,
  });
}

async function substituteReply(chatId: number, text: string) {
  if (await isRateLimited(`tg-swap:${chatId}`, 30, 60 * 60)) return send(chatId, "Let's take a short break — try again soon.");
  const name = await resolveIngredient(text);
  void tg("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
  return send(chatId, renderSubstitution(name, await suggestSubstitutes(name)));
}

function pickMedia(msg: TgMessage): { kind: "image" | "audio"; fileId: string; mediaType: string } | null {
  if (msg.photo?.length) {
    const largest = msg.photo[msg.photo.length - 1];
    return { kind: "image", fileId: largest.file_id, mediaType: "image/jpeg" };
  }
  if (msg.voice) return { kind: "audio", fileId: msg.voice.file_id, mediaType: msg.voice.mime_type ?? "audio/ogg" };
  if (msg.audio) return { kind: "audio", fileId: msg.audio.file_id, mediaType: msg.audio.mime_type ?? "audio/mpeg" };
  const doc = msg.document;
  if (doc?.mime_type?.startsWith("image/")) return { kind: "image", fileId: doc.file_id, mediaType: doc.mime_type };
  if (doc?.mime_type?.startsWith("audio/")) return { kind: "audio", fileId: doc.file_id, mediaType: doc.mime_type };
  return null;
}

async function fetchFile(fileId: string, mediaType: string): Promise<IncomingFile> {
  const ext = mediaType.split("/")[1]?.split(";")[0] ?? "bin";
  return { data: await downloadFile(fileId), mediaType, name: `telegram.${ext}` };
}

/** Park this photo; after a short wait, the handler holding the first photo imports the whole album. */
async function collectAlbum(msg: TgMessage, media: { kind: "image" | "audio"; fileId: string; mediaType: string }) {
  const groupId = msg.media_group_id!;
  await db()
    .insert(pendingMedia)
    .values({
      groupId,
      messageId: msg.message_id,
      chatId: msg.chat.id,
      fileId: media.fileId,
      mediaType: media.mediaType,
      caption: msg.caption ?? null,
    })
    .onConflictDoNothing();
  await new Promise((r) => setTimeout(r, ALBUM_WAIT_MS));

  const parts = await db()
    .select()
    .from(pendingMedia)
    .where(eq(pendingMedia.groupId, groupId))
    .orderBy(asc(pendingMedia.messageId));
  if (parts[0]?.messageId !== msg.message_id) return; // another handler owns this album

  await db().delete(pendingMedia).where(eq(pendingMedia.groupId, groupId));
  // Housekeeping for albums whose owner crashed.
  await db().delete(pendingMedia).where(lt(pendingMedia.createdAt, new Date(Date.now() - 3600_000)));

  const user = await linkedUser(msg.chat.id);
  if (!user) return;
  await importAndReply(msg.chat.id, user.id, async () => ({
    kind: "image",
    caption: parts.find((p) => p.caption)?.caption ?? undefined,
    files: await Promise.all(parts.map((p) => fetchFile(p.fileId, p.mediaType))),
  }));
}

async function importAndReply(chatId: number, userId: string | null, build: () => Promise<IngestRequest>) {
  const status = await send(chatId, "Reading it… 🍳");
  void tg("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
  try {
    const { recipeId, duplicate } = await ingest(await build(), userId);
    if (duplicate) {
      const [fresh, original] = await Promise.all([
        db().query.recipes.findFirst({ where: eq(recipes.id, recipeId) }),
        db().query.recipes.findFirst({ where: eq(recipes.id, duplicate.id) }),
      ]);
      const diff = ingredientDiff(
        original?.ingredients.map((i) => i.canonical) ?? [],
        fresh?.ingredients.map((i) => i.canonical) ?? [],
      );
      return edit(chatId, status.message_id, renderDuplicatePrompt(fresh?.title ?? "", duplicate.title, diff), {
        reply_markup: duplicateKeyboard(recipeId),
      });
    }
    await showRecipe(chatId, recipeId, "effective", status.message_id);
  } catch (err) {
    console.error("telegram import failed", err);
    const why = err instanceof NotARecipeError ? err.message : "Something went wrong reading that. Try again?";
    await edit(chatId, status.message_id, why);
  }
}

async function searchAndReply(chatId: number, query: string) {
  const results = (await searchRecipes(query, 6)).slice(0, 6);
  if (results.length === 0) return send(chatId, `Nothing for “${esc(query)}” yet.`);
  const lines = results.map((r, i) => {
    const match = r.match
      ? ` — <i>${r.match.missing ? `needs ${r.match.missing} more` : "you have everything"}</i>`
      : "";
    return `${i + 1}. ${esc(r.title)}${match}`;
  });
  return send(chatId, lines.join("\n"), {
    reply_markup: {
      inline_keyboard: results.map((r, i) => [
        { text: `${i + 1}. ${r.title}`.slice(0, 60), callback_data: `o:${r.id}` },
      ]),
    },
  });
}

async function handleCallback(cb: NonNullable<TgUpdate["callback_query"]>) {
  await tg("answerCallbackQuery", { callback_query_id: cb.id }).catch(() => {});
  const chatId = cb.message?.chat.id;
  if (!chatId || !cb.data) return;
  const user = await linkedUser(chatId);
  if (!user) return;

  const dup = parseDuplicateCallback(cb.data);
  if (dup) {
    try {
      const id = await resolveDuplicate(dup.id, dup.choice, { userId: user.id, isAdmin: user.isAdmin });
      return showRecipe(chatId, id, "effective", cb.message?.message_id);
    } catch (err) {
      return send(chatId, esc(err instanceof Error ? err.message : "Couldn't do that."));
    }
  }

  const parsed = parseCallback(cb.data);
  if (!parsed) return;
  await showRecipe(chatId, parsed.id, parsed.view, parsed.open ? undefined : cb.message?.message_id);
}

async function showRecipe(chatId: number, id: string, view: TgView, messageId?: number) {
  const r = await db().query.recipes.findFirst({ where: eq(recipes.id, id) });
  if (!r) return send(chatId, "That recipe is gone.");
  const source =
    view === "source" && r.sourceId
      ? ((await db().query.sources.findFirst({ where: eq(sources.id, r.sourceId) })) ?? null)
      : null;
  const text = renderRecipe(r, view, source);
  const reply_markup = viewKeyboard(r.id, view, appUrl());
  return messageId ? edit(chatId, messageId, text, { reply_markup }) : send(chatId, text, { reply_markup });
}
