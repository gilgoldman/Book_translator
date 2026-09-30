import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Chat, Incoming, Tap } from "@/lib/assistant/chat";
import type { WebEvent } from "./protocol";

// The website's chat channel: what the browser's form becomes for the assistant, and what the
// assistant's replies become for the browser. The assistant itself is stubbed.

vi.mock("server-only", () => ({}));
const assistant = vi.hoisted(() => ({ onMessage: vi.fn(), onTap: vi.fn() }));
vi.mock("@/lib/assistant", () => assistant);

const { handleWebInput, parseWebInput, webChat } = await import("./index");
const { recipeOnScreen } = await import("./protocol");

const recipeId = "0b6c2f7e-1d7e-4a57-9e36-0a5e3f2b8c11";
const person = { id: "u1", locale: null, isAdmin: false };

const form = (fields: Record<string, string | File | File[]>) => {
  const f = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    for (const v of Array.isArray(value) ? value : [value]) f.append(key, v);
  }
  return f;
};
const file = (type: string, name = "f") => new File([new Uint8Array([1, 2, 3])], name, { type });

beforeEach(() => vi.clearAllMocks());

describe("parseWebInput", () => {
  it("turns typed text into a message, about the recipe on screen", async () => {
    const input = await parseWebInput(form({ ref: "m1", text: " no buttermilk? ", recipe: recipeId }));
    expect(input).toEqual({ kind: "message", msg: { ref: "m1", text: "no buttermilk?", repliedToRecipe: recipeId } });
  });

  it("ignores a recipe that isn't an id", async () => {
    const input = await parseWebInput(form({ ref: "m1", text: "hi", recipe: "'; drop table" }));
    expect(input?.kind === "message" && input.msg.repliedToRecipe).toBeNull();
  });

  it("sends photos as an album, with the text as its caption", async () => {
    const input = await parseWebInput(form({ ref: "m2", text: "Gran's", files: [file("image/jpeg"), file("image/png")] }));
    expect(input?.kind).toBe("message");
    const msg = (input as { msg: Incoming }).msg;
    expect(msg.text).toBeUndefined();
    expect(msg.caption).toBe("Gran's");
    expect(msg.attachment?.kind).toBe("image");
    const files = await msg.attachment!.load();
    expect(files.map((f) => f.mediaType)).toEqual(["image/jpeg", "image/png"]);
    expect([...files[0].data]).toEqual([1, 2, 3]);
  });

  it("takes a voice note alone, and leaves out other files", async () => {
    const input = await parseWebInput(form({ ref: "m3", files: [file("application/pdf"), file("audio/webm")] }));
    const msg = (input as { msg: Incoming }).msg;
    expect(msg.attachment?.kind).toBe("audio");
    expect(await msg.attachment!.load()).toHaveLength(1);
    const pdfOnly = await parseWebInput(form({ ref: "m4", files: [file("application/pdf")] }));
    expect((pdfOnly as { msg: Incoming }).msg.attachment).toBeUndefined();
  });

  it("checks a tapped button's action", async () => {
    const action = { kind: "view", recipeId, view: "ratios", locale: "he" };
    expect(await parseWebInput(form({ tap: JSON.stringify(action), on: "b1" }))).toEqual({
      kind: "tap",
      tap: { action, on: "b1", voiceNote: null },
    });
    for (const bad of [
      { ...action, view: "secret" },
      { ...action, recipeId: "not-an-id" },
      { ...action, locale: "fr" },
      { kind: "duplicate", recipeId, choice: "delete-all", locale: null },
      { kind: "nope" },
    ]) {
      expect(await parseWebInput(form({ tap: JSON.stringify(bad), on: "b1" }))).toBeNull();
    }
    expect(await parseWebInput(form({ tap: "{not json", on: "b1" }))).toBeNull();
    expect(await parseWebInput(form({ tap: JSON.stringify(action) }))).toBeNull();
  });

  it("brings the voice note along for “it's a recipe, save it”", async () => {
    const input = await parseWebInput(
      form({ tap: JSON.stringify({ kind: "saveVoice", locale: "en" }), on: "b2", voiceRef: "m3", files: file("audio/webm") }),
    );
    const tap = (input as { tap: Tap }).tap;
    expect(tap.voiceNote?.ref).toBe("m3");
    expect(tap.voiceNote?.attachment.kind).toBe("audio");
  });

  it("needs a message ref", async () => {
    expect(await parseWebInput(form({ text: "hi" }))).toBeNull();
    expect(await parseWebInput(form({ ref: "has spaces", text: "hi" }))).toBeNull();
  });
});

describe("webChat", () => {
  it("streams every reply, edit and reaction to the browser", async () => {
    const events: WebEvent[] = [];
    const chat: Chat = webChat((e) => events.push(e), "he");
    expect(chat.languageHint).toBe("he");
    expect(chat.appUrl).toBe("");
    const ref = await chat.send({ text: "<b>hi</b>" }, { replyTo: "m1" });
    await chat.edit(ref, { text: "bye", buttons: [[{ label: "x", url: "/recipes/1" }]] });
    await chat.removeButtons(ref);
    chat.react("m1", "saved");
    chat.typing();
    expect(events).toEqual([
      { op: "send", ref, reply: { text: "<b>hi</b>" }, replyTo: "m1" },
      { op: "edit", ref, reply: { text: "bye", buttons: [[{ label: "x", url: "/recipes/1" }]] } },
      { op: "removeButtons", ref },
      { op: "react", ref: "m1", emoji: "🔥" },
      { op: "typing" },
    ]);
  });

  it("hands messages and taps to the assistant", async () => {
    const emit = vi.fn();
    const msg = { ref: "m1", text: "hi" };
    await handleWebInput(person, { kind: "message", msg }, emit, "en");
    expect(assistant.onMessage).toHaveBeenCalledWith(expect.objectContaining({ channel: "web" }), person, msg);
    const tap = { action: { kind: "open", recipeId, locale: null }, on: "b1" } as const;
    await handleWebInput(person, { kind: "tap", tap }, emit);
    expect(assistant.onTap).toHaveBeenCalledWith(expect.objectContaining({ channel: "web" }), person, tap);
  });
});

describe("recipeOnScreen", () => {
  it("finds the recipe in a recipe page's path", () => {
    expect(recipeOnScreen(`/recipes/${recipeId}`)).toBe(recipeId);
    expect(recipeOnScreen(`/recipes/${recipeId}/edit`)).toBe(recipeId);
    expect(recipeOnScreen("/")).toBeNull();
    expect(recipeOnScreen("/recipes/new")).toBeNull();
    expect(recipeOnScreen(null)).toBeNull();
  });
});
