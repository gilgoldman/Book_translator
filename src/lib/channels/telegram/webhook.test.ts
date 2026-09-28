import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Chat } from "@/lib/assistant";
import type { TgUpdate } from "./api";

// The Telegram channel around a stand-in assistant: what reaches the assistant from an update,
// and which Bot API calls its replies become.

const id = "0b6c2f7e-1d7e-4a57-9e36-0a5e3f2b8c11";
const linked = vi.hoisted(() => ({ person: null as { id: string; locale: string | null; isAdmin: boolean } | null }));

vi.mock("server-only", () => ({}));
vi.mock("drizzle-orm", () => ({ and: () => undefined, asc: () => undefined, eq: () => undefined, isNotNull: () => undefined, lt: () => undefined }));
vi.mock("@/db", () => ({
  pendingMedia: {},
  users: {},
  db: () => ({ query: { users: { findFirst: async () => linked.person ?? undefined } } }),
}));
vi.mock("@/lib/auth", () => ({ checkCredentials: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ isRateLimited: async () => false }));
vi.mock("@/lib/assistant", () => ({ onMessage: vi.fn(), onTap: vi.fn() }));

const { handleUpdate } = await import("./webhook");
const { onMessage, onTap } = await import("@/lib/assistant");

/** Every Bot API call made, as [method, body]. */
const calls: [string, Record<string, unknown>][] = [];

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  linked.person = { id: "u1", locale: "en", isAdmin: false };
  process.env.TELEGRAM_BOT_TOKEN = "t";
  vi.stubGlobal("fetch", async (url: string, init: { body: string }) => {
    calls.push([url.split("/").pop()!, JSON.parse(init.body)]);
    return Response.json({ ok: true, result: { message_id: 100 + calls.length } });
  });
});

const chat = { id: 9, type: "private" };

describe("a message", () => {
  it("reaches the assistant with the recipe it replied to", async () => {
    const replied = { message_id: 3, chat, reply_markup: { inline_keyboard: [[{ callback_data: `v:${id}:classic:en` }]] } };
    await handleUpdate({ message: { message_id: 4, chat, from: { language_code: "he" }, text: " no buttermilk ", reply_to_message: replied } });
    expect(onMessage).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "telegram", languageHint: "he" }),
      linked.person,
      { ref: 4, text: "no buttermilk", caption: undefined, attachment: undefined, repliedToRecipe: id },
    );
  });

  it("from a chat nobody signed in to gets the way in, not the assistant", async () => {
    linked.person = null;
    await handleUpdate({ message: { message_id: 4, chat, text: "leeks" } });
    expect(onMessage).not.toHaveBeenCalled();
    expect(calls).toMatchObject([["sendMessage", { chat_id: 9, text: expect.stringContaining("/login username password") }]]);
  });
});

describe("the assistant's replies", () => {
  it("become HTML messages with inline keyboards, replies and reactions", async () => {
    vi.mocked(onMessage).mockImplementationOnce(async (c: Chat) => {
      const ref = await c.send(
        { text: "<b>Hi</b>", buttons: [[{ label: "Open", action: { kind: "open", recipeId: id, locale: "en" } }]] },
        { replyTo: 4 },
      );
      await c.edit(ref, { text: "done" });
      c.react(4, "saved");
    });
    await handleUpdate({ message: { message_id: 4, chat, text: "hi" } });
    expect(calls).toEqual([
      [
        "sendMessage",
        {
          chat_id: 9,
          text: "<b>Hi</b>",
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
          reply_parameters: { message_id: 4, allow_sending_without_reply: true },
          reply_markup: { inline_keyboard: [[{ text: "Open", callback_data: `o:${id}:en` }]] },
        },
      ],
      ["editMessageText", { chat_id: 9, message_id: 101, text: "done", parse_mode: "HTML", link_preview_options: { is_disabled: true } }],
      ["setMessageReaction", { chat_id: 9, message_id: 4, reaction: [{ type: "emoji", emoji: "🔥" }] }],
    ]);
  });
});

describe("a tapped button", () => {
  it("reaches the assistant as an action, with the voice note to save", async () => {
    const voice = { message_id: 5, chat, voice: { file_id: "v" } };
    const update: TgUpdate = {
      callback_query: { id: "cb", data: "s:he", message: { message_id: 6, chat: { id: 9 }, reply_to_message: voice } },
    };
    await handleUpdate(update);
    expect(calls[0]).toEqual(["answerCallbackQuery", { callback_query_id: "cb" }]);
    expect(onTap).toHaveBeenCalledWith(expect.objectContaining({ channel: "telegram" }), linked.person, {
      action: { kind: "saveVoice", locale: "he" },
      on: 6,
      voiceNote: { ref: 5, caption: undefined, attachment: { kind: "audio", load: expect.any(Function) } },
    });
  });

  it("that means nothing is ignored", async () => {
    await handleUpdate({ callback_query: { id: "cb", data: "zzz", message: { message_id: 6, chat: { id: 9 } } } });
    expect(onTap).not.toHaveBeenCalled();
  });
});
