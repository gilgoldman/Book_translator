import { describe, expect, it } from "vitest";
import type { Action } from "@/lib/assistant/chat";
import { speaker } from "@/lib/assistant/language";
import { openButtons, viewButtons } from "@/lib/assistant/render";
import { decodeAction, encodeAction, inlineKeyboard, parseLogin, pickMedia, recipeIdOf } from "./codec";

const id = "0b6c2f7e-1d7e-4a57-9e36-0a5e3f2b8c11";
const en = speaker("en");
const he = speaker("he");

describe("another menu", () => {
  it("cuts long words to whole words that fit in 64 bytes", () => {
    const data = encodeAction({
      kind: "menu",
      meal: "lunch",
      round: 19,
      cuisines: ["middle-eastern", "levantine", "persian"],
      rest: "חצילים טחינה לימון שום פטרוזיליה עגבניות מלפפונים",
      locale: "he",
    });
    expect(Buffer.byteLength(data)).toBeLessThanOrEqual(64);
    expect(decodeAction(data)).toMatchObject({ meal: "lunch", round: 19, cuisines: ["middle-eastern", "levantine", "persian"] });
    expect((decodeAction(data) as { rest: string }).rest).toMatch(/^חצילים טחינה( \S+)*$/);
  });

  it("refuses cuisines it doesn't know", () => {
    expect(decodeAction("m:d:0:99:en:")).toBeNull();
  });
});

describe("buttons", () => {
  const every: Action[] = [
    ...(["effective", "classic", "ratios", "source"] as const).map((view) => ({ kind: "view", recipeId: id, view, locale: "he" }) as const),
    { kind: "open", recipeId: id, locale: "he" },
    ...(["keep-original", "replace", "keep-both"] as const).map((choice) => ({ kind: "duplicate", recipeId: id, choice, locale: "he" }) as const),
    { kind: "saveVoice", locale: "he" },
    { kind: "fix", editId: id, choice: "apply", locale: "he" },
    { kind: "fix", editId: id, choice: "cancel", locale: "he" },
    { kind: "menu", meal: "dinner", round: 3, cuisines: ["italian", "levantine"], rest: "eggplant", locale: "he" },
    { kind: "menu", meal: "brunch", round: 0, cuisines: [], rest: "", locale: "en" },
  ];

  it("round-trip every action within 64 bytes, and no action reads as another", () => {
    for (const action of every) {
      const data = encodeAction(action);
      expect(Buffer.byteLength(data)).toBeLessThanOrEqual(64);
      expect(decodeAction(data)).toEqual(action);
    }
  });

  it("keep the formats of buttons already in people's chats", () => {
    expect(every.map(encodeAction)).toEqual([
      `v:${id}:effective:he`,
      `v:${id}:classic:he`,
      `v:${id}:ratios:he`,
      `v:${id}:source:he`,
      `o:${id}:he`,
      `d:${id}:o:he`,
      `d:${id}:r:he`,
      `d:${id}:b:he`,
      "s:he",
      `f:${id}:a:he`,
      `f:${id}:c:he`,
      "m:d:3:0.6:he:eggplant",
      "m:b:0::en:",
    ]);
    // Buttons sent before they carried a language still work.
    expect(decodeAction(`o:${id}`)).toEqual({ kind: "open", recipeId: id, locale: null });
    expect(decodeAction(`v:${id}:ratios`)).toEqual({ kind: "view", recipeId: id, view: "ratios", locale: null });
    expect(decodeAction(`d:${id}:o`)).toEqual({ kind: "duplicate", recipeId: id, choice: "keep-original", locale: null });
    expect(decodeAction("s")).toEqual({ kind: "saveVoice", locale: null });
    // …and are written the same way when there's no language to carry.
    expect(encodeAction({ kind: "open", recipeId: id, locale: null })).toBe(`o:${id}`);
    expect(encodeAction({ kind: "saveVoice", locale: null })).toBe("s");
    // A language the app no longer speaks reads as none.
    expect(decodeAction(`o:${id}:fr`)).toEqual({ kind: "open", recipeId: id, locale: null });
  });

  it("ignore anything else", () => {
    expect(decodeAction("v:nope:effective")).toBeNull();
    expect(decodeAction(`v:${id}:sideways`)).toBeNull();
    expect(decodeAction(`d:${id}:x`)).toBeNull();
    expect(decodeAction("hello")).toBeNull();
  });

  it("become an inline keyboard, labels cut short but never mid-emoji", () => {
    const kb = inlineKeyboard(viewButtons(id, "effective", he, "https://book.test"));
    expect(kb.inline_keyboard[0][0]).toEqual({ text: "· 🔥 בישול ·", callback_data: `v:${id}:effective:he` });
    expect(kb.inline_keyboard.at(-1)).toEqual([{ text: "📖 לפתוח בספר", url: `https://book.test/recipes/${id}` }]);
    const long = inlineKeyboard(openButtons([{ id, title: "🥧".repeat(80) }], en)).inline_keyboard[0][0].text;
    expect([...long]).toHaveLength(60);
  });

  it("tell which recipe a message shows", () => {
    expect(recipeIdOf(inlineKeyboard(viewButtons(id, "effective", en, "https://app")))).toBe(id);
    expect(recipeIdOf(inlineKeyboard(openButtons([{ id, title: "Pancakes" }], en)))).toBeNull();
    expect(recipeIdOf(undefined)).toBeNull();
    expect(recipeIdOf({})).toBeNull();
    // A link button carries no callback data.
    expect(recipeIdOf({ inline_keyboard: [[{}], [{ callback_data: `v:${id}:source` }]] })).toBe(id);
  });
});

describe("messages", () => {
  it("read /login, password spaces and all", () => {
    expect(parseLogin("/login gil secret pass")).toEqual({ username: "gil", password: "secret pass" });
    expect(parseLogin("/login@CookbookBot gil pw")).toEqual({ username: "gil", password: "pw" });
    expect(parseLogin("/login gil")).toBeNull();
    expect(parseLogin("leeks")).toBeNull();
  });

  it("pick the largest photo, and voice notes", () => {
    const chat = { id: 1, type: "private" };
    const photo = { message_id: 1, chat, photo: [{ file_id: "s", width: 90, height: 90 }, { file_id: "l", width: 1280, height: 1280 }] };
    expect(pickMedia(photo)).toEqual({ kind: "image", fileId: "l", mediaType: "image/jpeg" });
    expect(pickMedia({ message_id: 2, chat, voice: { file_id: "v" } })).toEqual({ kind: "audio", fileId: "v", mediaType: "audio/ogg" });
    expect(pickMedia({ message_id: 2, chat, voice: { file_id: "v", mime_type: "audio/mp4" } })).toMatchObject({ mediaType: "audio/mp4" });
  });

  it("pick audio files and images or audio sent as files, nothing else", () => {
    const chat = { id: 1, type: "private" };
    expect(pickMedia({ message_id: 1, chat, audio: { file_id: "a" } })).toEqual({ kind: "audio", fileId: "a", mediaType: "audio/mpeg" });
    expect(pickMedia({ message_id: 1, chat, audio: { file_id: "a", mime_type: "audio/x-m4a" } })).toMatchObject({ mediaType: "audio/x-m4a" });
    expect(pickMedia({ message_id: 2, chat, document: { file_id: "d", mime_type: "image/png" } })).toEqual({ kind: "image", fileId: "d", mediaType: "image/png" });
    expect(pickMedia({ message_id: 3, chat, document: { file_id: "d", mime_type: "audio/wav" } })).toEqual({ kind: "audio", fileId: "d", mediaType: "audio/wav" });
    expect(pickMedia({ message_id: 4, chat, document: { file_id: "d", mime_type: "application/pdf" } })).toBeNull();
    expect(pickMedia({ message_id: 5, chat, document: { file_id: "d" } })).toBeNull();
    expect(pickMedia({ message_id: 6, chat, photo: [] })).toBeNull();
    expect(pickMedia({ message_id: 7, chat, text: "hi" })).toBeNull();
  });
});
