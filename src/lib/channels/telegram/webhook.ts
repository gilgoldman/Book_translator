import { and, asc, eq, lt } from "drizzle-orm";
import { db, pendingMedia, users } from "@/db";
import { onMessage, onTap, type Attachment, type Chat, type Person, type Reply } from "@/lib/assistant";
import { replyLocale, speaker, usualLocale } from "@/lib/assistant/language";
import { PERSONA } from "@/lib/assistant/persona";
import { esc } from "@/lib/assistant/render";
import { checkCredentials } from "@/lib/auth";
import type { Locale } from "@/lib/i18n/config";
import type { IncomingFile } from "@/lib/ingest";
import { isRateLimited } from "@/lib/rate-limit";
import { downloadFile, edit, react, send, tg, typing, type TgMessage, type TgUpdate } from "./api";
import { decodeAction, inlineKeyboard, parseLogin, pickMedia, recipeIdOf, type TgMedia } from "./codec";
import { TELEGRAM, TELEGRAM_WORDS } from "./settings";

// The Telegram channel. It knows who is writing (a chat is linked to an account with /login),
// turns each update into something the assistant (src/lib/assistant) understands, and the
// assistant's replies into Telegram messages. Albums, which arrive one photo per update, are
// gathered into one recipe here.

/** The assistant's words plus Telegram's own. */
const words = (locale: Locale) => speaker(locale, TELEGRAM_WORDS);

/** The approved user linked to this chat, if any. */
async function linkedPerson(chatId: number): Promise<Person | undefined> {
  return db().query.users.findFirst({
    where: and(eq(users.telegramChatId, chatId), eq(users.status, "approved")),
    columns: { id: true, locale: true, isAdmin: true },
  });
}

/** The assistant's side of a chat, sent through Telegram. */
function telegramChat(chatId: number, languageHint?: string): Chat {
  const markup = (reply: Reply) => (reply.buttons ? { reply_markup: inlineKeyboard(reply.buttons) } : {});
  return {
    channel: "telegram",
    languageHint,
    async send(reply, { replyTo } = {}) {
      const replying =
        replyTo === undefined ? {} : { reply_parameters: { message_id: Number(replyTo), allow_sending_without_reply: true } };
      return (await send(chatId, reply.text, { ...replying, ...markup(reply) })).message_id;
    },
    async edit(ref, reply) {
      await edit(chatId, Number(ref), reply.text, markup(reply));
    },
    async removeButtons(ref) {
      await tg("editMessageReplyMarkup", {
        chat_id: chatId,
        message_id: Number(ref),
        reply_markup: { inline_keyboard: [] },
      }).catch(() => {});
    },
    react: (ref, mood) => react(chatId, Number(ref), PERSONA.reactions[mood]),
    typing: () => typing(chatId),
  };
}

/** A photo or voice note in Telegram, downloaded when the assistant asks for it. */
function attachment(media: TgMedia): Attachment {
  return { kind: media.kind, load: async () => [await fetchFile(media.fileId, media.mediaType)] };
}

async function fetchFile(fileId: string, mediaType: string): Promise<IncomingFile> {
  const ext = mediaType.split("/")[1]?.split(";")[0] ?? "bin";
  return { data: await downloadFile(fileId), mediaType, name: `telegram.${ext}` };
}

export async function handleUpdate(update: TgUpdate) {
  if (update.callback_query) return handleTap(update.callback_query);
  const msg = update.message;
  if (!msg || msg.chat.type !== "private") return;

  const chatId = msg.chat.id;
  const hint = msg.from?.language_code;
  const text = (msg.text ?? "").trim();
  const login = parseLogin(text);
  if (login) return signIn(msg, login);

  const person = await linkedPerson(chatId);
  if (!person) return send(chatId, words(replyLocale(null, hint, text || msg.caption))("tg.private"));

  const media = pickMedia(msg);
  if (media && msg.media_group_id) return collectAlbum(msg, media);
  return onMessage(telegramChat(chatId, hint), person, {
    ref: msg.message_id,
    text,
    caption: msg.caption,
    attachment: media ? attachment(media) : undefined,
    repliedToRecipe: recipeIdOf(msg.reply_to_message?.reply_markup),
  });
}

/** "/login username password" links this chat to their account. */
async function signIn(msg: TgMessage, { username, password }: { username: string; password: string }) {
  const chatId = msg.chat.id;
  const hint = msg.from?.language_code;
  // Don't leave the password sitting in the chat.
  await tg("deleteMessage", { chat_id: chatId, message_id: msg.message_id }).catch(() => {});
  // A login's words are just a username and password: they don't set the reply's language.
  const before = words(usualLocale(null, hint));
  if (await isRateLimited(`tg-login:${chatId}`, 5, 15 * 60)) {
    return send(chatId, before("tg.tooManyLogins"));
  }
  const user = await checkCredentials(username, password);
  if (!user || user.status === "declined") return send(chatId, before("err.badLogin"));
  if (user.status === "pending") return send(chatId, before("tg.pending"));
  await db().update(users).set({ telegramChatId: null }).where(eq(users.telegramChatId, chatId));
  await db().update(users).set({ telegramChatId: chatId }).where(eq(users.id, user.id));
  const t = words(usualLocale(user, hint));
  return send(chatId, `${esc(t("tg.connected", { name: user.displayName ?? user.username }))}\n\n${t("bot.help")}`);
}

/** Park this photo; after a short wait, the handler holding the first photo imports the whole album. */
async function collectAlbum(msg: TgMessage, media: TgMedia) {
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
  await new Promise((r) => setTimeout(r, TELEGRAM.albumWaitMs));

  const parts = await db()
    .select()
    .from(pendingMedia)
    .where(eq(pendingMedia.groupId, groupId))
    .orderBy(asc(pendingMedia.messageId));
  if (parts[0]?.messageId !== msg.message_id) return; // another handler owns this album

  await db().delete(pendingMedia).where(eq(pendingMedia.groupId, groupId));
  // Housekeeping for albums whose owner crashed.
  await db().delete(pendingMedia).where(lt(pendingMedia.createdAt, new Date(Date.now() - 3600_000)));

  const person = await linkedPerson(msg.chat.id);
  if (!person) return;
  return onMessage(telegramChat(msg.chat.id, msg.from?.language_code), person, {
    ref: parts[0].messageId,
    caption: parts.find((p) => p.caption)?.caption ?? undefined,
    attachment: {
      kind: "image",
      load: () => Promise.all(parts.map((p) => fetchFile(p.fileId, p.mediaType))),
    },
  });
}

async function handleTap(cb: NonNullable<TgUpdate["callback_query"]>) {
  await tg("answerCallbackQuery", { callback_query_id: cb.id }).catch(() => {});
  const message = cb.message;
  if (!message || !cb.data) return;
  const person = await linkedPerson(message.chat.id);
  if (!person) return;
  const action = decodeAction(cb.data);
  if (!action) return;
  // "I heard: …" replies to the voice note, so that's where a voice note to save is.
  const voice = action.kind === "saveVoice" ? message.reply_to_message : undefined;
  const media = voice && pickMedia(voice);
  return onTap(telegramChat(message.chat.id, cb.from?.language_code), person, {
    action,
    on: message.message_id,
    voiceNote: voice && media ? { ref: voice.message_id, caption: voice.caption, attachment: attachment(media) } : null,
  });
}
