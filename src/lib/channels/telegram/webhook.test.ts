import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Chat, Incoming } from "@/lib/assistant";
import { WORDS } from "@/lib/assistant/persona";
import { MESSAGES } from "@/lib/i18n/messages";
import type { TgMessage, TgUpdate } from "./api";
import { TELEGRAM_WORDS } from "./settings";

// The Telegram channel around a stand-in assistant: what reaches the assistant from an update,
// and which Bot API calls its replies become. The database is a few arrays.

const id = "0b6c2f7e-1d7e-4a57-9e36-0a5e3f2b8c11";
type AlbumRow = { groupId: string; messageId: number; chatId: number; fileId: string; mediaType: string; caption: string | null; createdAt: Date };
type Condition = { eq?: [string, unknown]; lt?: [string, Date] };

const store = vi.hoisted(() => ({
  person: null as { id: string; locale: string | null; isAdmin: boolean } | null,
  updates: [] as { set: Record<string, unknown>; where: unknown }[],
  album: [] as AlbumRow[],
}));

vi.mock("server-only", () => ({}));
// Conditions become plain data the stand-in database can read.
vi.mock("drizzle-orm", () => ({
  and: (...all: unknown[]) => ({ and: all }),
  asc: (column: string) => column,
  eq: (column: string, value: unknown) => ({ eq: [column, value] }),
  isNotNull: () => undefined,
  lt: (column: string, value: Date) => ({ lt: [column, value] }),
}));
vi.mock("@/db", () => ({
  pendingMedia: { groupId: "groupId", messageId: "messageId", createdAt: "createdAt" },
  users: { id: "id", status: "status", telegramChatId: "telegramChatId" },
  db: () => ({
    query: { users: { findFirst: async () => store.person ?? undefined } },
    update: () => ({ set: (set: Record<string, unknown>) => ({ where: async (where: unknown) => void store.updates.push({ set, where }) }) }),
    insert: () => ({
      values: (row: Omit<AlbumRow, "createdAt">) => ({
        onConflictDoNothing: async () => {
          if (!store.album.some((r) => r.groupId === row.groupId && r.messageId === row.messageId)) {
            store.album.push({ ...row, createdAt: new Date() });
          }
        },
      }),
    }),
    select: () => ({
      from: () => ({
        where: ({ eq: [, groupId] = ["", ""] }: Condition) => ({
          orderBy: async () => store.album.filter((r) => r.groupId === groupId).sort((a, b) => a.messageId - b.messageId),
        }),
      }),
    }),
    delete: () => ({
      where: async ({ eq, lt }: Condition) => {
        store.album = store.album.filter((r) => (eq ? r.groupId !== eq[1] : !(lt && r.createdAt < lt[1])));
      },
    }),
  }),
}));
vi.mock("@/lib/auth", () => ({ checkCredentials: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ isRateLimited: vi.fn(async () => false) }));
vi.mock("@/lib/assistant", () => ({ onMessage: vi.fn(), onTap: vi.fn() }));

const { handleUpdate } = await import("./webhook");
const { onMessage, onTap } = await import("@/lib/assistant");
const { checkCredentials } = await import("@/lib/auth");
const { isRateLimited } = await import("@/lib/rate-limit");

/** Every Bot API call made, as [method, body]; `refuse` lists methods Telegram turns down. */
const calls: [string, Record<string, unknown>][] = [];
let refuse: string[] = [];

const person = { id: "u1", locale: "en", isAdmin: false };
const chat = { id: 9, type: "private" };
const message = (fields: Partial<TgMessage>): TgMessage => ({ message_id: 4, chat, ...fields });
const incoming = () => vi.mocked(onMessage).mock.calls[0][2] as Incoming;
const methods = () => calls.map(([method]) => method);

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  refuse = [];
  Object.assign(store, { person, updates: [], album: [] });
  process.env.TELEGRAM_BOT_TOKEN = "t";
  vi.stubGlobal("fetch", async (url: string, init?: { body: string }) => {
    // A file download (after getFile), else a Bot API method.
    if (url.includes("/file/bot")) return new Response(new Uint8Array([url.length % 256]));
    const method = url.split("/").pop()!;
    calls.push([method, JSON.parse(init!.body)]);
    if (refuse.includes(method)) return Response.json({ ok: false, description: "Bad Request" });
    if (method === "getFile") return Response.json({ ok: true, result: { file_path: `photos/${JSON.parse(init!.body).file_id}.jpg` } });
    return Response.json({ ok: true, result: { message_id: 100 + calls.length } });
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("updates it leaves alone", () => {
  it("group chats, and updates without a message", async () => {
    await handleUpdate({ message: { message_id: 4, chat: { id: -5, type: "group" }, text: "leeks" } });
    await handleUpdate({});
    expect(onMessage).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });
});

describe("signing in", () => {
  const user = { id: "u9", username: "gil", displayName: "Gil <3", status: "approved", locale: "he" };

  it("deletes the password, links the chat and welcomes them in their language", async () => {
    vi.mocked(checkCredentials).mockResolvedValueOnce(user as never);
    await handleUpdate({ message: message({ from: { language_code: "en" }, text: "/login gil secret pass" }) });
    expect(checkCredentials).toHaveBeenCalledWith("gil", "secret pass");
    expect(isRateLimited).toHaveBeenCalledWith("tg-login:9", 5, 900);
    expect(calls).toEqual([
      ["deleteMessage", { chat_id: 9, message_id: 4 }],
      ["sendMessage", expect.objectContaining({ chat_id: 9, text: `🎉 היי Gil &lt;3, התחברת!\n\n${WORDS.he["bot.help"]}` })],
    ]);
    // Any other account on this chat is unlinked first.
    expect(store.updates).toEqual([
      { set: { telegramChatId: null }, where: { eq: ["telegramChatId", 9] } },
      { set: { telegramChatId: 9 }, where: { eq: ["id", "u9"] } },
    ]);
    expect(onMessage).not.toHaveBeenCalled();
  });

  it("uses their username when they have no name", async () => {
    vi.mocked(checkCredentials).mockResolvedValueOnce({ ...user, displayName: null, locale: "en" } as never);
    await handleUpdate({ message: message({ text: "/login gil pw" }) });
    expect(calls[1][1].text).toMatch(/^🎉 Hi gil, you're in!/);
  });

  it("goes on when the password message can't be deleted", async () => {
    refuse = ["deleteMessage"];
    vi.mocked(checkCredentials).mockResolvedValueOnce(user as never);
    await handleUpdate({ message: message({ text: "/login gil pw" }) });
    expect(methods()).toEqual(["deleteMessage", "sendMessage"]);
  });

  it("turns away wrong passwords, declined and waiting accounts, without linking", async () => {
    const tries: [unknown, string][] = [
      [null, MESSAGES.en["err.badLogin"] as string],
      [{ ...user, status: "declined" }, MESSAGES.en["err.badLogin"] as string],
      [{ ...user, status: "pending" }, TELEGRAM_WORDS.en["tg.pending"]],
    ];
    for (const [found, reply] of tries) {
      calls.length = 0;
      vi.mocked(checkCredentials).mockResolvedValueOnce(found as never);
      // What a login says is a username and password: it doesn't set the reply's language.
      await handleUpdate({ message: message({ from: { language_code: "en" }, text: "/login gil סיסמה" }) });
      expect(calls[1]).toEqual(["sendMessage", expect.objectContaining({ text: reply })]);
    }
    expect(store.updates).toEqual([]);
  });

  it("slows down after five tries, in their app's language", async () => {
    vi.mocked(isRateLimited).mockResolvedValueOnce(true);
    await handleUpdate({ message: message({ from: { language_code: "he" }, text: "/login gil pw" }) });
    expect(checkCredentials).not.toHaveBeenCalled();
    expect(calls[1]).toEqual(["sendMessage", expect.objectContaining({ text: TELEGRAM_WORDS.he["tg.tooManyLogins"] })]);
  });
});

describe("a message", () => {
  it("reaches the assistant with the recipe it replied to", async () => {
    const replied = message({ message_id: 3, reply_markup: { inline_keyboard: [[{ callback_data: `v:${id}:classic:en` }]] } });
    await handleUpdate({ message: message({ from: { language_code: "he" }, text: " no buttermilk ", reply_to_message: replied }) });
    expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ channel: "telegram", languageHint: "he" }), person, {
      ref: 4,
      text: "no buttermilk",
      caption: undefined,
      attachment: undefined,
      repliedToRecipe: id,
    });
  });

  it("with nothing readable in it still reaches the assistant, which nudges", async () => {
    await handleUpdate({ message: message({}) });
    expect(incoming()).toMatchObject({ ref: 4, text: "", attachment: undefined, repliedToRecipe: null });
  });

  it("with a photo hands over the largest size, downloaded only when asked", async () => {
    const photo = [{ file_id: "small", width: 90, height: 90 }, { file_id: "large", width: 1280, height: 1280 }];
    await handleUpdate({ message: message({ photo, caption: "gran's" }) });
    expect(incoming()).toMatchObject({ caption: "gran's", attachment: { kind: "image" } });
    expect(calls).toEqual([]);
    const [file] = await incoming().attachment!.load();
    expect(calls).toEqual([["getFile", { file_id: "large" }]]);
    expect(file).toEqual({ data: expect.any(Uint8Array), mediaType: "image/jpeg", name: "telegram.jpeg" });
  });

  it("with a voice note hands it over as audio", async () => {
    await handleUpdate({ message: message({ voice: { file_id: "v", mime_type: "audio/ogg; codecs=opus" } }) });
    const [file] = await incoming().attachment!.load();
    expect(incoming().attachment!.kind).toBe("audio");
    expect(file).toMatchObject({ mediaType: "audio/ogg; codecs=opus", name: "telegram.ogg" });
  });

  it("from a chat nobody signed in to gets the way in, in the language it was written in", async () => {
    store.person = null;
    await handleUpdate({ message: message({ from: { language_code: "en" }, text: "יש לי הרבה כרישות" }) });
    expect(onMessage).not.toHaveBeenCalled();
    expect(calls).toEqual([["sendMessage", expect.objectContaining({ chat_id: 9, text: TELEGRAM_WORDS.he["tg.private"] })]]);
    calls.length = 0;
    await handleUpdate({ message: message({ photo: [{ file_id: "p", width: 1, height: 1 }], caption: "של סבתא" }) });
    expect(calls).toEqual([["sendMessage", expect.objectContaining({ text: TELEGRAM_WORDS.he["tg.private"] })]]);
  });
});

describe("a photo album", () => {
  const part = (messageId: number, fileId: string, caption?: string) =>
    ({ message: message({ message_id: messageId, media_group_id: "g1", photo: [{ file_id: fileId, width: 1, height: 1 }], caption }) }) as TgUpdate;

  it("is gathered for a moment, then filed as one recipe by the first photo's handler", async () => {
    vi.useFakeTimers();
    // Left behind by a handler that crashed an hour ago.
    store.album.push({ groupId: "old", messageId: 1, chatId: 9, fileId: "x", mediaType: "image/jpeg", caption: null, createdAt: new Date(Date.now() - 2 * 3600_000) });
    const both = Promise.all([handleUpdate(part(10, "p1")), handleUpdate(part(11, "p2", "gran's tart"))]);
    await vi.advanceTimersByTimeAsync(2500);
    await both;
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(incoming()).toMatchObject({ ref: 10, caption: "gran's tart", attachment: { kind: "image" } });
    expect(store.album).toEqual([]);
    vi.useRealTimers();
    const files = await incoming().attachment!.load();
    expect(calls.map(([, body]) => body)).toEqual([{ file_id: "p1" }, { file_id: "p2" }]);
    expect(files).toHaveLength(2);
  });

  it("from someone signed out meanwhile is dropped", async () => {
    vi.useFakeTimers();
    const done = handleUpdate(part(10, "p1"));
    await vi.advanceTimersByTimeAsync(0);
    store.person = null;
    await vi.advanceTimersByTimeAsync(2500);
    await done;
    expect(onMessage).not.toHaveBeenCalled();
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
    await handleUpdate({ message: message({ text: "hi" }) });
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

  it("can drop their buttons, and show typing, never minding a refusal", async () => {
    refuse = ["editMessageReplyMarkup"];
    vi.mocked(onMessage).mockImplementationOnce(async (c: Chat) => {
      await c.send({ text: "plain" });
      await c.removeButtons(101);
      c.typing();
    });
    await handleUpdate({ message: message({ text: "hi" }) });
    expect(calls).toEqual([
      ["sendMessage", { chat_id: 9, text: "plain", parse_mode: "HTML", link_preview_options: { is_disabled: true } }],
      ["editMessageReplyMarkup", { chat_id: 9, message_id: 101, reply_markup: { inline_keyboard: [] } }],
      ["sendChatAction", { chat_id: 9, action: "typing" }],
    ]);
  });
});

describe("a tapped button", () => {
  const tap = (data: string | undefined, fields: Partial<NonNullable<TgUpdate["callback_query"]>> = {}): TgUpdate => ({
    callback_query: { id: "cb", data, message: { message_id: 6, chat: { id: 9 } }, ...fields },
  });

  it("is answered at once and reaches the assistant as an action", async () => {
    await handleUpdate(tap(`v:${id}:ratios:he`, { from: { language_code: "he" } }));
    expect(calls[0]).toEqual(["answerCallbackQuery", { callback_query_id: "cb" }]);
    expect(onTap).toHaveBeenCalledWith(expect.objectContaining({ channel: "telegram", languageHint: "he" }), person, {
      action: { kind: "view", recipeId: id, view: "ratios", locale: "he" },
      on: 6,
      voiceNote: null,
    });
  });

  it("to save a voice note brings the voice note it answered", async () => {
    const voice = message({ message_id: 5, voice: { file_id: "v" }, caption: "gran's" });
    await handleUpdate(tap("s:he", { message: { message_id: 6, chat: { id: 9 }, reply_to_message: voice } }));
    expect(onTap).toHaveBeenCalledWith(expect.anything(), person, {
      action: { kind: "saveVoice", locale: "he" },
      on: 6,
      voiceNote: { ref: 5, caption: "gran's", attachment: { kind: "audio", load: expect.any(Function) } },
    });
    const [file] = await vi.mocked(onTap).mock.calls[0][2].voiceNote!.attachment.load();
    expect(file).toMatchObject({ mediaType: "audio/ogg", name: "telegram.ogg" });
  });

  it("to save a voice note that's gone brings none", async () => {
    await handleUpdate(tap("s:he"));
    await handleUpdate(tap("s:he", { message: { message_id: 6, chat: { id: 9 }, reply_to_message: message({ text: "hi" }) } }));
    for (const [, , t] of vi.mocked(onTap).mock.calls) expect(t.voiceNote).toBeNull();
  });

  it("is ignored when it means nothing, or nobody's signed in", async () => {
    await handleUpdate(tap("zzz"));
    await handleUpdate(tap(undefined));
    await handleUpdate(tap(`o:${id}`, { message: undefined }));
    store.person = null;
    await handleUpdate(tap(`o:${id}`));
    expect(onTap).not.toHaveBeenCalled();
    expect(methods()).toEqual(Array(4).fill("answerCallbackQuery"));
  });
});
