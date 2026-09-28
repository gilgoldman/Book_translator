import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Chat, Person, Reply } from "./chat";

// The assistant on a pretend channel that writes down everything it's asked to do: no Telegram
// anywhere. A real channel implements the same `Chat`. The cookbook behind it is stubbed.

const id = "0b6c2f7e-1d7e-4a57-9e36-0a5e3f2b8c11";
const recipe = {
  id,
  title: "Pancakes",
  titleEnglish: "Pancakes",
  language: "en",
  translations: {},
  cuisine: "american",
  course: "breakfast",
  season: "all-year",
  totalMinutes: 20,
  servings: "4",
  ingredients: [
    { group: null, name: "buttermilk", canonical: "buttermilk", original: "250 ml buttermilk", quantity: 250, unit: "ml", grams: null, ml: 250, volume: "1 cup", metric: "250 ml", note: null, optional: false },
  ],
  steps: [{ text: "Whisk the buttermilk into the flour.", timers: [] }],
  enrichment: null,
  sourceId: null,
  createdBy: null,
};

const book = vi.hoisted(() => ({ lastShown: null as { id: string; at: Date } | null }));

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("drizzle-orm", () => ({ eq: () => undefined }));
vi.mock("@/db", () => ({
  recipeColumns: {},
  recipes: {},
  sources: {},
  users: {},
  db: () => ({
    query: {
      recipes: { findFirst: async () => recipe },
      users: { findFirst: async () => ({ telegramRecipeId: book.lastShown?.id, telegramRecipeAt: book.lastShown?.at }) },
      sources: { findFirst: async () => null },
    },
    update: () => ({
      set: (row: { telegramRecipeId: string; telegramRecipeAt: Date }) => ({
        where: async () => {
          book.lastShown = { id: row.telegramRecipeId, at: row.telegramRecipeAt };
        },
      }),
    }),
  }),
}));
vi.mock("@/lib/ai/substitute", () => ({
  substituteContext: (r: typeof recipe) => ({ recipeId: r.id, recipeTitle: r.titleEnglish, line: "", usedIn: [] }),
  suggestSubstitutes: vi.fn(async () => ({ asked: null, options: [{ use: "Milk + lemon", amount: "250 ml", how: "Rest.", effect: "Same" }], tip: null })),
}));
vi.mock("@/lib/ai/voice", () => ({ hearVoiceNote: vi.fn() }));
vi.mock("@/lib/dedupe", () => ({ resolveDuplicate: vi.fn() }));
vi.mock("@/lib/ingest", () => ({ ingest: vi.fn(), NotARecipeError: class NotARecipeError extends Error {} }));
vi.mock("@/lib/ingredient-names", () => ({ localName: async (n: string) => n, localNames: async () => new Map() }));
vi.mock("@/lib/ingredients", () => ({
  resolveIngredient: async (text: string) => text,
  recipesUsingMost: async () => [],
  goesWellWith: async () => [],
}));
vi.mock("@/lib/rate-limit", () => ({ isRateLimited: async () => false }));
vi.mock("@/lib/search", () => ({ searchRecipes: vi.fn(async () => [{ id, title: "Pancakes", match: { missing: 1 } }]) }));
vi.mock("@/lib/translations", () => ({
  localizeRecipe: (r: typeof recipe) => ({ recipe: r, status: "original", language: r.language, refresh: false }),
  ensureTranslations: async () => {},
}));

const { onMessage, onTap } = await import(".");
const { WORDS } = await import("./persona");
const { hearVoiceNote } = await import("@/lib/ai/voice");
const { suggestSubstitutes } = await import("@/lib/ai/substitute");
const { ingest, NotARecipeError } = await import("@/lib/ingest");
const { searchRecipes } = await import("@/lib/search");

type Said =
  | { send: string; ref: number; replyTo?: unknown; buttons?: Reply["buttons"] }
  | { edit: string; ref: unknown; buttons?: Reply["buttons"] }
  | { react: string; ref: unknown }
  | { removeButtons: unknown };

/** A channel that only writes things down. Its replies are numbered from 100. */
function pretendChat() {
  const said: Said[] = [];
  let next = 100;
  const chat: Chat = {
    channel: "pretend",
    async send(reply, options) {
      const ref = next++;
      said.push({ send: reply.text, ref, replyTo: options?.replyTo, buttons: reply.buttons });
      return ref;
    },
    async edit(ref, reply) {
      said.push({ edit: reply.text, ref, buttons: reply.buttons });
    },
    async removeButtons(ref) {
      said.push({ removeButtons: ref });
    },
    react: (ref, mood) => said.push({ react: mood, ref }),
    typing: () => {},
  };
  return { chat, said };
}

const person: Person = { id: "u1", locale: "en", isAdmin: false };
const audio = { kind: "audio" as const, load: async () => [{ data: new Uint8Array(1), mediaType: "audio/ogg", name: "note.ogg" }] };

beforeEach(() => {
  vi.clearAllMocks();
  book.lastShown = null;
});

describe("the assistant", () => {
  it("helps", async () => {
    const { chat, said } = pretendChat();
    await onMessage(chat, person, { ref: 1, text: "/help" });
    expect(said).toEqual([{ send: WORDS.en["bot.help"], ref: 100, replyTo: undefined, buttons: undefined }]);
  });

  it("answers a search in the language it was asked in, one button per recipe", async () => {
    const { chat, said } = pretendChat();
    await onMessage(chat, person, { ref: 1, text: "חלב חמוץ" });
    expect(searchRecipes).toHaveBeenCalledWith("חלב חמוץ", "he", 6);
    expect(said).toMatchObject([
      { send: "1️⃣ Pancakes — <i>🛒 חסרים עוד 1</i>", buttons: [[{ action: { kind: "open", recipeId: id, locale: "he" } }]] },
    ]);
  });

  it("files a link: reading, then the recipe in place of the status, then remembers it", async () => {
    vi.mocked(ingest).mockResolvedValueOnce({ recipeId: id, duplicate: null });
    const { chat, said } = pretendChat();
    await onMessage(chat, person, { ref: 7, text: "https://example.test/pancakes" });
    expect(ingest).toHaveBeenCalledWith({ kind: "url", url: "https://example.test/pancakes" }, "u1", "en");
    expect(said).toMatchObject([
      { react: "reading", ref: 7 },
      { send: expect.stringMatching(/Reading it|On it|Filing it/), ref: 100 },
      { edit: expect.stringContaining("🍳 <b>Pancakes</b>"), ref: 100 },
      { react: "saved", ref: 7 },
    ]);
    expect(book.lastShown?.id).toBe(id);
  });

  it("says so when there's no recipe in it", async () => {
    vi.mocked(ingest).mockRejectedValueOnce(new NotARecipeError());
    const { chat, said } = pretendChat();
    await onMessage(chat, person, { ref: 7, text: "/add hello" });
    expect(said.slice(2)).toMatchObject([{ react: "notRecipe", ref: 7 }, { edit: expect.any(String), ref: 100 }]);
  });

  it("takes a swap question to be about the recipe it just showed", async () => {
    book.lastShown = { id, at: new Date() };
    const { chat, said } = pretendChat();
    await onMessage(chat, person, { ref: 1, text: "no buttermilk" });
    expect(suggestSubstitutes).toHaveBeenCalledWith("buttermilk", "en", expect.objectContaining({ recipeId: id }), undefined);
    expect(said).toMatchObject([{ send: expect.stringContaining("No buttermilk for Pancakes?") }]);
  });

  it("answers a spoken question under what it heard, with a way to save it as a recipe", async () => {
    vi.mocked(hearVoiceNote).mockResolvedValueOnce({ kind: "question", query: "pancakes" });
    const { chat, said } = pretendChat();
    await onMessage(chat, person, { ref: 5, attachment: audio });
    expect(said).toMatchObject([
      { react: "reading", ref: 5 },
      { send: "🎙 I heard: <i>pancakes</i>", replyTo: 5, buttons: [[{ action: { kind: "saveVoice", locale: "en" } }]] },
      { send: expect.stringContaining("Pancakes") },
      { react: "answered", ref: 5 },
    ]);
  });
});

describe("its buttons", () => {
  it("switch the recipe on the message to another view", async () => {
    const { chat, said } = pretendChat();
    await onTap(chat, person, { action: { kind: "view", recipeId: id, view: "classic", locale: "he" }, on: 42 });
    expect(said).toMatchObject([{ edit: expect.stringContaining("• 250 ml buttermilk"), ref: 42 }]);
  });

  it("save a voice note as a recipe after all, taking the button away", async () => {
    vi.mocked(ingest).mockResolvedValueOnce({ recipeId: id, duplicate: null });
    const { chat, said } = pretendChat();
    await onTap(chat, person, { action: { kind: "saveVoice", locale: "en" }, on: 42, voiceNote: { ref: 5, attachment: audio } });
    expect(ingest).toHaveBeenCalledWith(expect.objectContaining({ kind: "audio" }), "u1", "en");
    expect(said).toMatchObject([
      { removeButtons: 42 },
      { react: "reading", ref: 5 },
      { send: expect.any(String), ref: 100 },
      { edit: expect.stringContaining("Pancakes"), ref: 100 },
      { react: "saved", ref: 5 },
    ]);
  });

  it("can't save a voice note the channel couldn't find", async () => {
    const { chat, said } = pretendChat();
    await onTap(chat, person, { action: { kind: "saveVoice", locale: "en" }, on: 42, voiceNote: null });
    expect(said).toMatchObject([{ send: WORDS.en["bot.couldnt"] }]);
  });
});
