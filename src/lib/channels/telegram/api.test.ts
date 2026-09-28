import { beforeEach, describe, expect, it, vi } from "vitest";

// The Bot API client against a stand-in Telegram.

const owners = vi.hoisted(() => ({ list: [] as { chatId: number; locale: string | null }[], broken: false }));

vi.mock("server-only", () => ({}));
vi.mock("drizzle-orm", () => ({ and: () => undefined, eq: () => undefined, isNotNull: () => undefined }));
vi.mock("@/db", () => ({
  users: {},
  db: () => ({
    select: () => ({
      from: () => ({
        where: async () => {
          if (owners.broken) throw new Error("database is down");
          return owners.list;
        },
      }),
    }),
  }),
}));

const { downloadFile, edit, notifyOwner, react, send, tg, typing } = await import("./api");

/** Every call to Telegram, as [url, body]; `answer` decides the reply. */
const calls: [string, unknown][] = [];
let answer: (url: string) => Response;

const ok = (result: unknown = true) => Response.json({ ok: true, result });
const refused = (description: string) => Response.json({ ok: false, description });

beforeEach(() => {
  calls.length = 0;
  owners.list = [];
  owners.broken = false;
  process.env.TELEGRAM_BOT_TOKEN = "123:abc";
  delete process.env.APP_URL;
  answer = () => ok({ message_id: 7 });
  vi.stubGlobal("fetch", async (url: string, init?: { body?: string }) => {
    calls.push([url, init?.body ? JSON.parse(init.body) : undefined]);
    return answer(url);
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("tg", () => {
  it("posts JSON to the bot's method and returns the result", async () => {
    expect(await tg("getMe", { x: 1 })).toEqual({ message_id: 7 });
    expect(calls).toEqual([["https://api.telegram.org/bot123:abc/getMe", { x: 1 }]]);
  });

  it("throws what Telegram says went wrong", async () => {
    answer = () => refused("Bad Request: chat not found");
    await expect(tg("sendMessage", {})).rejects.toThrow("Telegram sendMessage: Bad Request: chat not found");
  });

  it("needs the token", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    await expect(tg("getMe", {})).rejects.toThrow("TELEGRAM_BOT_TOKEN is not set");
  });
});

describe("messages", () => {
  it("are sent as HTML without link previews", async () => {
    expect(await send(9, "<b>hi</b>", { reply_markup: { inline_keyboard: [] } })).toEqual({ message_id: 7 });
    expect(calls[0][1]).toEqual({
      chat_id: 9,
      text: "<b>hi</b>",
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: { inline_keyboard: [] },
    });
  });

  it("are edited the same way, and an edit that changes nothing is fine", async () => {
    await edit(9, 7, "done");
    expect(calls[0]).toEqual([
      "https://api.telegram.org/bot123:abc/editMessageText",
      { chat_id: 9, message_id: 7, text: "done", parse_mode: "HTML", link_preview_options: { is_disabled: true } },
    ]);
    answer = () => refused("Bad Request: message is not modified");
    await expect(edit(9, 7, "done")).resolves.toBeUndefined();
    answer = () => refused("Bad Request: message to edit not found");
    await expect(edit(9, 7, "done")).rejects.toThrow("message to edit not found");
  });
});

describe("best-effort touches", () => {
  it("show typing and react, never throwing", async () => {
    answer = () => refused("Bad Request: REACTION_INVALID");
    expect(() => typing(9)).not.toThrow();
    expect(() => react(9, 4, "🔥")).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(calls.map(([url, body]) => [url.split("/").pop(), body])).toEqual([
      ["sendChatAction", { chat_id: 9, action: "typing" }],
      ["setMessageReaction", { chat_id: 9, message_id: 4, reaction: [{ type: "emoji", emoji: "🔥" }] }],
    ]);
  });
});

describe("downloadFile", () => {
  it("asks where the file is, then fetches it", async () => {
    answer = (url) => (url.includes("/file/") ? new Response(new Uint8Array([1, 2, 3])) : ok({ file_path: "voice/1.oga" }));
    expect(await downloadFile("abc")).toEqual(new Uint8Array([1, 2, 3]));
    expect(calls.map(([url]) => url)).toEqual([
      "https://api.telegram.org/bot123:abc/getFile",
      "https://api.telegram.org/file/bot123:abc/voice/1.oga",
    ]);
  });

  it("throws when the file won't come", async () => {
    answer = (url) => (url.includes("/file/") ? new Response("gone", { status: 404 }) : ok({ file_path: "voice/1.oga" }));
    await expect(downloadFile("abc")).rejects.toThrow("Could not download the file (404)");
  });
});

describe("notifyOwner", () => {
  it("tells each linked owner, in their language, where to approve", async () => {
    owners.list = [
      { chatId: 1, locale: "he" },
      { chatId: 2, locale: null },
    ];
    process.env.APP_URL = "https://book.test/";
    await notifyOwner((t) => `${t.locale}: someone asked to join`);
    expect(calls.map(([, body]) => body)).toEqual([
      { chat_id: 1, text: expect.stringMatching(/^he: someone asked to join\n\n.*https:\/\/book\.test\/settings/) },
      { chat_id: 2, text: "en: someone asked to join\n\nApprove at https://book.test/settings" },
    ]);
  });

  it("leaves out the link without APP_URL", async () => {
    owners.list = [{ chatId: 1, locale: "en" }];
    await notifyOwner(() => "hello");
    expect(calls[0][1]).toEqual({ chat_id: 1, text: "hello" });
  });

  it("does nothing without a bot, and never throws", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    owners.list = [{ chatId: 1, locale: "en" }];
    await notifyOwner(() => "hello");
    expect(calls).toEqual([]);

    process.env.TELEGRAM_BOT_TOKEN = "123:abc";
    owners.broken = true;
    await expect(notifyOwner(() => "hello")).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith("notifyOwner failed", expect.any(Error));
  });
});
