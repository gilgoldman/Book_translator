import "server-only";
import { and, eq, isNotNull } from "drizzle-orm";
import { db, users } from "@/db";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import type { Translator } from "@/lib/i18n/translate";
import { translatorFor } from "@/lib/i18n/translator-for";

// Minimal Telegram Bot API client. No SDK needed for a webhook bot.

const token = () => {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  return t;
};

export async function tg<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; result: T; description?: string };
  if (!json.ok) throw new Error(`Telegram ${method}: ${json.description}`);
  return json.result;
}

export function send(chatId: number, text: string, extra: Record<string, unknown> = {}) {
  return tg<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...extra,
  });
}

export function edit(chatId: number, messageId: number, text: string, extra: Record<string, unknown> = {}) {
  return tg("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...extra,
  }).catch((err: Error) => {
    // Editing to identical content is an error we don't care about.
    if (!err.message.includes("message is not modified")) throw err;
  });
}

/** "typing…" at the top of the chat for a few seconds. Best-effort. */
export function typing(chatId: number) {
  void tg("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
}

/** An emoji reaction on their message: says "got it" without another message. Best-effort. */
export function react(chatId: number, messageId: number, emoji: "👀" | "🔥" | "🤔" | "😢") {
  void tg("setMessageReaction", {
    chat_id: chatId,
    message_id: messageId,
    reaction: [{ type: "emoji", emoji }],
  }).catch(() => {});
}

export async function downloadFile(fileId: string): Promise<Uint8Array> {
  const file = await tg<{ file_path: string }>("getFile", { file_id: fileId });
  const res = await fetch(`https://api.telegram.org/file/bot${token()}/${file.file_path}`);
  if (!res.ok) throw new Error(`Could not download the file (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

// The subset of the Update object we use.
export type TgUpdate = {
  message?: TgMessage;
  callback_query?: {
    id: string;
    from?: { language_code?: string };
    data?: string;
    message?: { message_id: number; chat: { id: number } };
  };
};

export type TgMessage = {
  message_id: number;
  from?: { language_code?: string };
  chat: { id: number; type: string };
  text?: string;
  caption?: string;
  media_group_id?: string;
  photo?: { file_id: string; width: number; height: number }[];
  voice?: { file_id: string; mime_type?: string };
  audio?: { file_id: string; mime_type?: string; file_name?: string };
  document?: { file_id: string; mime_type?: string; file_name?: string };
};

/** Best-effort ping to the owner's Telegram (if linked and the bot is configured), in their language. */
export async function notifyOwner(message: (t: Translator) => string) {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;
  try {
    const owners = await db()
      .select({ chatId: users.telegramChatId, locale: users.locale })
      .from(users)
      .where(and(eq(users.isAdmin, true), isNotNull(users.telegramChatId)));
    const appUrl = process.env.APP_URL?.replace(/\/$/, "");
    for (const o of owners) {
      const t = translatorFor(isLocale(o.locale) ? o.locale : DEFAULT_LOCALE);
      await tg("sendMessage", {
        chat_id: o.chatId,
        text: `${message(t)}${appUrl ? `\n\n${t("people.notifyApprove", { url: `${appUrl}/settings` })}` : ""}`,
      });
    }
  } catch (err) {
    console.error("notifyOwner failed", err);
  }
}
