import "server-only";
import { and, eq, isNotNull } from "drizzle-orm";
import { db, users } from "@/db";

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
    data?: string;
    message?: { message_id: number; chat: { id: number } };
  };
};

export type TgMessage = {
  message_id: number;
  chat: { id: number; type: string };
  text?: string;
  caption?: string;
  media_group_id?: string;
  photo?: { file_id: string; width: number; height: number }[];
  voice?: { file_id: string; mime_type?: string };
  audio?: { file_id: string; mime_type?: string; file_name?: string };
  document?: { file_id: string; mime_type?: string; file_name?: string };
};

/** Best-effort ping to the owner's Telegram (if linked and the bot is configured). */
export async function notifyOwner(text: string) {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;
  try {
    const owners = await db()
      .select({ chatId: users.telegramChatId })
      .from(users)
      .where(and(eq(users.isAdmin, true), isNotNull(users.telegramChatId)));
    const appUrl = process.env.APP_URL?.replace(/\/$/, "");
    for (const o of owners) {
      await tg("sendMessage", {
        chat_id: o.chatId,
        text: `${text}${appUrl ? `\n\nApprove at ${appUrl}/settings` : ""}`,
      });
    }
  } catch (err) {
    console.error("notifyOwner failed", err);
  }
}
