import { asc, eq, lt } from "drizzle-orm";
import { after } from "next/server";
import { db, pendingMedia, recipes, sources, users } from "@/db";
import { checkCredentials } from "@/lib/auth";
import { ingest, NotARecipeError, type IncomingFile, type IngestRequest } from "@/lib/ingest";
import { searchRecipes } from "@/lib/search";
import { downloadFile, edit, send, tg, type TgMessage, type TgUpdate } from "@/lib/telegram";
import { classifyText, esc, parseCallback, renderRecipe, viewKeyboard, type TgView } from "@/lib/telegram-format";

export const maxDuration = 300;

const ALBUM_WAIT_MS = 2500;
const appUrl = () => process.env.APP_URL?.replace(/\/$/, "");

const HELP = `Send me anything and I'll file it in the cookbook:
· a photo or screenshot (albums = one recipe)
· a link to a recipe
· a voice note describing a recipe
· pasted recipe text

Or ask: <i>leeks, eggs, feta</i> or <i>that lemony chicken</i>.
/find … searches, /add … forces an import.`;

export async function POST(request: Request) {
  if (request.headers.get("x-telegram-bot-api-secret-token") !== process.env.TELEGRAM_WEBHOOK_SECRET) {
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
    const user = await checkCredentials(intent.username, intent.password);
    if (!user) return send(chatId, "That username and password don't match.");
    await db().update(users).set({ telegramChatId: null }).where(eq(users.telegramChatId, chatId));
    await db().update(users).set({ telegramChatId: chatId }).where(eq(users.id, user.id));
    return send(chatId, `Hi ${esc(user.displayName ?? user.username)}, you're connected.\n\n${HELP}`);
  }

  const user = await db().query.users.findFirst({ where: eq(users.telegramChatId, chatId) });
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
  if (intent.kind === "search") return searchAndReply(chatId, intent.query);
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

  const user = await db().query.users.findFirst({ where: eq(users.telegramChatId, msg.chat.id) });
  await importAndReply(msg.chat.id, user?.id ?? null, async () => ({
    kind: "image",
    caption: parts.find((p) => p.caption)?.caption ?? undefined,
    files: await Promise.all(parts.map((p) => fetchFile(p.fileId, p.mediaType))),
  }));
}

async function importAndReply(chatId: number, userId: string | null, build: () => Promise<IngestRequest>) {
  const status = await send(chatId, "Reading it… 🍳");
  void tg("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
  try {
    const id = await ingest(await build(), userId);
    await showRecipe(chatId, id, "effective", status.message_id);
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
  const parsed = cb.data ? parseCallback(cb.data) : null;
  const chatId = cb.message?.chat.id;
  if (!parsed || !chatId) return;
  const user = await db().query.users.findFirst({ where: eq(users.telegramChatId, chatId) });
  if (!user) return;
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
