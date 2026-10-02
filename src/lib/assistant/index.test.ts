import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Attachment, Chat, Person, Reply } from "./chat";

// The assistant on a pretend channel that writes down everything it's asked to do: no Telegram
// anywhere. A real channel implements the same `Chat`. The cookbook behind it is stubbed, and
// `book` says what it holds.

const id = "0b6c2f7e-1d7e-4a57-9e36-0a5e3f2b8c11";
const otherId = "5d0e9a1c-2b3f-4c5d-8e6f-7a8b9c0d1e2f";
const editId = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

const line = (name: string, original: string) => ({
  group: null, name, canonical: name, original, quantity: null, unit: null, grams: null, ml: null, volume: null, metric: null, note: null, optional: false,
});

const pancakes = {
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
  ingredients: [{ ...line("buttermilk", "250 ml buttermilk"), metric: "250 ml" }],
  steps: [{ text: "Whisk the buttermilk into the flour.", timers: [] }],
  enrichment: null,
  sourceId: null as string | null,
  createdBy: null as string | null,
  prepMinutes: null,
  cookMinutes: null,
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const book = vi.hoisted(() => ({
  recipes: {} as Record<string, unknown>,
  uploaders: {} as Record<string, { displayName: string | null; username: string }>,
  sources: {} as Record<string, unknown>,
  lastShown: null as { id: string; at: Date } | null,
  rememberedFor: null as string | null,
  memoryBroken: false,
  /** A correction waiting for Apply / Cancel, and what's been done with corrections. */
  edit: null as { id: string; recipeId: string; userId: string; proposal: unknown; baseUpdatedAt: Date; createdAt: Date } | null,
  editsInserted: [] as unknown[],
  /** What the next `localizeRecipe` calls report, in order. */
  localized: [] as { status: string; refresh: boolean }[],
  search: [] as { id: string; title: string; match?: { missing: number } }[],
  /** Members by what someone calls them; their recipes; recipes per cuisine. */
  cooks: {} as Record<string, { username: string; name: string }>,
  byCook: [] as { id: string; title: string; course: string; cuisine: string }[],
  cuisine: [] as { id: string; title: string; course: string; cuisine: string }[],
  uses: [] as { id: string; title: string; amount: string | null }[],
  pairs: [] as { name: string; count: number }[],
}));
const Busy = vi.hoisted(() => class Busy extends Error {});

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: vi.fn() }));
// Queries get the value they look for: `where: eq(recipes.id, id)` is just `id` here.
vi.mock("drizzle-orm", () => ({
  eq: (_column: unknown, value: unknown) => value,
  and: (...values: unknown[]) => values,
  lt: () => "old",
}));
vi.mock("@/db", () => ({
  recipeColumns: {},
  recipeEdits: {},
  recipes: {},
  sources: {},
  users: {},
  db: () => ({
    query: {
      recipes: { findFirst: async ({ where }: { where: string }) => book.recipes[where] },
      recipeEdits: {
        findFirst: async ({ where: [id, userId] }: { where: string[] }) =>
          book.edit && book.edit.id === id && book.edit.userId === userId ? book.edit : undefined,
      },
      users: {
        findFirst: async ({ where, columns }: { where: string; columns: Record<string, boolean> }) =>
          columns.telegramRecipeId
            ? { telegramRecipeId: book.lastShown?.id ?? null, telegramRecipeAt: book.lastShown?.at ?? null }
            : book.uploaders[where],
      },
      sources: { findFirst: async ({ where }: { where: string }) => book.sources[where] },
    },
    insert: () => ({
      values: (row: unknown) => ({
        returning: async () => {
          book.editsInserted.push(row);
          return [{ id: editId }];
        },
      }),
    }),
    delete: () => ({
      where: async (which: unknown) => {
        if (Array.isArray(which) && book.edit && which[0] === book.edit.id) book.edit = null;
      },
    }),
    update: () => ({
      set: (row: { telegramRecipeId: string; telegramRecipeAt: Date }) => ({
        where: async (who: string) => {
          if (book.memoryBroken) throw new Error("database is down");
          book.lastShown = { id: row.telegramRecipeId, at: row.telegramRecipeAt };
          book.rememberedFor = who;
        },
      }),
    }),
  }),
}));
vi.mock("@/lib/ai/errors", () => ({ isAiBusy: (err: unknown) => err instanceof Busy }));
vi.mock("@/lib/ai/substitute", () => ({
  substituteContext: (r: { id: string }) => ({ recipeId: r.id, recipeTitle: "", line: "", usedIn: [] }),
  suggestSubstitutes: vi.fn(async () => ({
    asked: null,
    options: [{ use: "Milk + lemon", amount: "250 ml", how: "Rest.", effect: "Same" }],
    tip: null,
  })),
}));
vi.mock("@/lib/ai/voice", () => ({ hearVoiceNote: vi.fn() }));
vi.mock("@/lib/dedupe", () => ({
  resolveDuplicate: vi.fn(),
  canEdit: (r: { createdBy: string | null }, who: { userId: string; isAdmin: boolean }) =>
    who.isAdmin || r.createdBy === null || r.createdBy === who.userId,
}));
vi.mock("@/lib/ingest", () => ({
  ingest: vi.fn(),
  saveCorrection: vi.fn(async () => true),
  NotARecipeError: class NotARecipeError extends Error {},
}));
vi.mock("@/lib/ai/correct", () => ({ proposeCorrection: vi.fn() }));
vi.mock("@/lib/ingredient-names", () => ({
  localName: async (name: string) => name,
  // Stand-in translations: shouting.
  localNames: async (names: string[]) => new Map(names.map((n) => [n, n.toUpperCase()])),
}));
vi.mock("@/lib/ingredients", () => ({
  resolveIngredient: async (text: string) => text,
  recipesUsingMost: vi.fn(async () => book.uses),
  goesWellWith: vi.fn(async () => book.pairs),
}));
vi.mock("@/lib/rate-limit", () => ({ isRateLimited: vi.fn(async () => false) }));
vi.mock("@/lib/search", () => ({
  searchRecipes: vi.fn(async () => book.search),
  findCook: vi.fn(async (who: string) => book.cooks[who.toLowerCase()] ?? null),
  recentRecipes: vi.fn(async () => book.byCook),
  recipesInCuisines: vi.fn(async () => book.cuisine),
}));
vi.mock("@/lib/translations", () => ({
  localizeRecipe: (r: { language: string }) => ({
    recipe: r,
    status: "original",
    language: r.language,
    refresh: false,
    ...book.localized.shift(),
  }),
  ensureTranslations: vi.fn(async () => {}),
}));

const { onMessage, onTap } = await import(".");
const { WORDS } = await import("./persona");
const { MESSAGES } = await import("@/lib/i18n/messages");
const { after } = await import("next/server");
const { hearVoiceNote } = await import("@/lib/ai/voice");
const { suggestSubstitutes } = await import("@/lib/ai/substitute");
const { resolveDuplicate } = await import("@/lib/dedupe");
const { ingest, NotARecipeError, saveCorrection } = await import("@/lib/ingest");
const { proposeCorrection } = await import("@/lib/ai/correct");
const { goesWellWith, recipesUsingMost } = await import("@/lib/ingredients");
const { isRateLimited } = await import("@/lib/rate-limit");
const { findCook, recentRecipes, recipesInCuisines, searchRecipes } = await import("@/lib/search");
const { ensureTranslations } = await import("@/lib/translations");

type Said =
  | { send: string; ref: number; replyTo?: unknown; buttons?: Reply["buttons"] }
  | { edit: string; ref: unknown; buttons?: Reply["buttons"] }
  | { react: string; ref: unknown }
  | { removeButtons: unknown };

/** A channel that only writes things down. Its replies are numbered from 100. */
function pretendChat(languageHint?: string) {
  const said: Said[] = [];
  let next = 100;
  const chat: Chat = {
    channel: "pretend",
    languageHint,
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
const file = (name: string, mediaType: string) => ({ data: new Uint8Array(1), mediaType, name });
const audio: Attachment = { kind: "audio", load: async () => [file("note.ogg", "audio/ogg")] };
const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  Object.assign(book, {
    recipes: { [id]: pancakes },
    uploaders: {},
    sources: {},
    lastShown: null,
    rememberedFor: null,
    memoryBroken: false,
    edit: null,
    editsInserted: [],
    localized: [],
    search: [{ id, title: "Pancakes", match: { missing: 1 } }],
    cooks: {},
    byCook: [],
    cuisine: [],
    uses: [],
    pairs: [],
  });
  delete process.env.APP_URL;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("what they send", () => {
  it("gets help on /help and /start", async () => {
    for (const text of ["/help", "/start"]) {
      const { chat, said } = pretendChat();
      await onMessage(chat, person, { ref: 1, text });
      expect(said).toEqual([{ send: WORDS.en["bot.help"], ref: 100, replyTo: undefined, buttons: undefined }]);
    }
  });

  it("gets a nudge when there's nothing it can read", async () => {
    const { chat, said } = pretendChat();
    await onMessage(chat, person, { ref: 1, text: "   " });
    expect(said).toMatchObject([{ send: WORDS.en["bot.nudge"] }]);
  });

  it("is answered in the language it was written in, one button per recipe", async () => {
    const { chat, said } = pretendChat();
    await onMessage(chat, person, { ref: 1, text: "חלב חמוץ" });
    expect(searchRecipes).toHaveBeenCalledWith("חלב חמוץ", "he", 6);
    expect(said).toEqual([
      {
        send: "1️⃣ Pancakes — <i>🛒 חסרים עוד 1</i>",
        ref: 100,
        replyTo: undefined,
        buttons: [[{ label: "1️⃣ Pancakes", action: { kind: "open", recipeId: id, locale: "he" } }]],
      },
    ]);
  });

  it("finding nothing says so, escaping what they typed", async () => {
    book.search = [];
    const { chat, said } = pretendChat();
    await onMessage(chat, person, { ref: 1, text: "<leeks>" });
    expect(said).toMatchObject([{ send: "🤷 Nothing for “&lt;leeks&gt;” yet.", buttons: undefined }]);
  });

  it("\"a lot of…\" lists what uses the most, and what goes with it", async () => {
    book.uses = [{ id, title: "Pancakes", amount: "250 ml" }];
    book.pairs = [{ name: "lemon", count: 3 }];
    const { chat, said } = pretendChat();
    await onMessage(chat, person, { ref: 1, text: "I have a lot of buttermilk" });
    expect(recipesUsingMost).toHaveBeenCalledWith("buttermilk", "en", 8);
    expect(goesWellWith).toHaveBeenCalledWith("buttermilk", 8);
    expect(said).toMatchObject([
      {
        send: "<b>🧺 Lots of buttermilk? These use the most:</b>\n\n1️⃣ Pancakes — <i>250 ml</i>\n\n💞 Goes well with: LEMON",
        buttons: [[{ action: { kind: "open", recipeId: id } }]],
      },
    ]);
  });

  it("\"a lot of…\" that nothing uses gets no buttons", async () => {
    const { chat, said } = pretendChat();
    await onMessage(chat, person, { ref: 1, text: "/lots saffron" });
    expect(said).toMatchObject([{ send: expect.stringMatching(/^🤷/), buttons: undefined }]);
  });
});

describe("someone's recipes", () => {
  const dana = { username: "dana", name: "Dana Levi" };
  const recipe = (n: number) => ({ id: `r${n}`, title: `Dish ${n}`, course: "main", cuisine: "italian" });

  it("lists the newest, with a link to the rest", async () => {
    book.cooks = { dana };
    book.byCook = Array.from({ length: 14 }, (_, i) => recipe(i + 1));
    process.env.APP_URL = "https://book.test/";
    const { chat, said } = pretendChat();
    await onMessage(chat, person, { ref: 1, text: "show me all recipes from user Dana" });
    expect(findCook).toHaveBeenCalledWith("Dana");
    expect(recentRecipes).toHaveBeenCalledWith("en", 500, "dana");
    const [reply] = said as { send: string; buttons: Reply["buttons"] }[];
    expect(reply.send).toMatch(/^<b>🧑‍🍳 Dana Levi added 14:<\/b>\n\n1️⃣ Dish 1\n/);
    expect(reply.send).toContain("12. Dish 12\n\n<i>…and 2 more in the cookbook.</i>");
    expect(reply.buttons).toHaveLength(13);
    expect(reply.buttons?.[12]).toEqual([{ label: "📖 Open in the cookbook", url: "https://book.test/?by=dana" }]);
  });

  it("says so when they've added nothing", async () => {
    book.cooks = { "דנה": dana };
    const { chat, said } = pretendChat();
    await onMessage(chat, person, { ref: 1, text: "המתכונים של דנה" });
    expect(said).toMatchObject([{ send: "🤷 Dana Levi עוד לא הוסיפו מתכונים.", buttons: undefined }]);
  });

  it("is a search when nobody goes by that name", async () => {
    const { chat } = pretendChat();
    await onMessage(chat, person, { ref: 1, text: "recipes from Italy" });
    expect(recentRecipes).not.toHaveBeenCalled();
    expect(searchRecipes).toHaveBeenCalledWith("recipes from Italy", "en", 6);
  });
});

describe("a menu", () => {
  const dish = (id: string, course: string, cuisine = "italian") => ({ id, title: id, course, cuisine });

  it("of a cuisine takes what matches the rest first, one dish per course", async () => {
    book.search = [dish("Eggplant pasta", "main"), dish("Baba ganoush", "starter", "levantine")];
    book.cuisine = [dish("Tiramisu", "dessert"), dish("Lasagne", "main"), dish("Minestrone", "soup")];
    const { chat, said } = pretendChat();
    await onMessage(chat, person, { ref: 1, text: "Let's build an Italian dinner menu with eggplant" });
    expect(searchRecipes).toHaveBeenCalledWith("eggplant", "en", 60);
    expect(recipesInCuisines).toHaveBeenCalledWith(["italian"], "en");
    expect(said).toMatchObject([
      {
        send:
          "<b>🍽 A dinner menu</b> · <i>Italian · eggplant</i>\n\n" +
          "1️⃣ 🍲 <i>Soup</i>: Minestrone\n2️⃣ 🍽 <i>Main</i>: Eggplant pasta\n3️⃣ 🍰 <i>Dessert</i>: Tiramisu",
        buttons: [
          [{ label: "1️⃣ Minestrone" }],
          [{ label: "2️⃣ Eggplant pasta" }],
          [{ label: "3️⃣ Tiramisu" }],
          [
            {
              label: "🔀 Another menu",
              action: { kind: "menu", meal: "dinner", cuisines: ["italian"], rest: "eggplant", round: 1, locale: "en" },
            },
          ],
        ],
      },
    ]);
  });

  it("\"another menu\" puts the next best dishes in place of the last", async () => {
    book.cuisine = [dish("Minestrone", "soup"), dish("Lasagne", "main"), dish("Bruschetta", "starter"), dish("Risotto", "main")];
    const { chat, said } = pretendChat();
    await onTap(chat, person, {
      action: { kind: "menu", meal: "dinner", cuisines: ["italian"], rest: "", round: 1, locale: "he" },
      on: 7,
    });
    expect(searchRecipes).not.toHaveBeenCalled();
    expect(said).toMatchObject([
      {
        edit: expect.stringContaining("<b>🍽 תפריט לארוחת ערב</b> · <i>איטלקי</i>"),
        ref: 7,
        buttons: [[{ label: "1️⃣ Bruschetta" }], [{ label: "2️⃣ Risotto" }], [{ action: { kind: "menu", round: 2 } }]],
      },
    ]);
  });

  it("with an ingredient searches for it", async () => {
    book.search = [dish("Pancakes", "main")];
    const { chat, said } = pretendChat();
    await onMessage(chat, person, { ref: 1, text: "lunch menu with buttermilk" });
    expect(searchRecipes).toHaveBeenCalledWith("buttermilk", "en", 60);
    expect(said).toMatchObject([{ send: expect.stringContaining("🥪 A lunch menu") }]);
  });

  it("with nothing asked picks from the whole book", async () => {
    book.byCook = [dish("Lasagne", "main")];
    const { chat, said } = pretendChat();
    await onMessage(chat, person, { ref: 1, text: "plan a dinner" });
    expect(recentRecipes).toHaveBeenCalledWith("en", 300);
    expect(said).toMatchObject([{ send: expect.stringContaining("Lasagne") }]);
  });

  it("says so when nothing fits", async () => {
    book.search = [dish("Lemonade", "drink")];
    const { chat, said } = pretendChat();
    await onMessage(chat, person, { ref: 1, text: "תפריט עם לימון" });
    expect(said).toMatchObject([{ send: "🤷 עדיין אין בספר מספיק לתפריט עם „לימון”.", buttons: undefined }]);
  });
});

describe("\"no buttermilk?\"", () => {
  it("is about the recipe it just showed", async () => {
    book.lastShown = { id, at: minutesAgo(5) };
    const { chat, said } = pretendChat();
    await onMessage(chat, person, { ref: 1, text: "no buttermilk" });
    expect(suggestSubstitutes).toHaveBeenCalledWith("buttermilk", "en", expect.objectContaining({ recipeId: id }), undefined);
    expect(said).toMatchObject([
      {
        send: expect.stringContaining("No buttermilk for Pancakes? Try:"),
        buttons: [[{ action: { kind: "open", recipeId: id, locale: "en" } }]],
      },
    ]);
  });

  it("is about the recipe they replied to, even with nothing remembered", async () => {
    const { chat } = pretendChat();
    await onMessage(chat, person, { ref: 1, text: "no buttermilk", repliedToRecipe: id });
    expect(suggestSubstitutes).toHaveBeenCalledWith("buttermilk", "en", expect.objectContaining({ recipeId: id }), undefined);
  });

  it("is general once the recipe it showed is old news", async () => {
    book.lastShown = { id, at: minutesAgo(121) };
    const { chat, said } = pretendChat();
    await onMessage(chat, person, { ref: 1, text: "no buttermilk" });
    expect(suggestSubstitutes).toHaveBeenCalledWith("buttermilk", "en", undefined, undefined);
    expect(said).toMatchObject([{ send: expect.stringContaining("No buttermilk? Try:"), buttons: undefined }]);
  });

  it("is general when the recipe doesn't use it, or is gone", async () => {
    book.lastShown = { id, at: minutesAgo(5) };
    const { chat } = pretendChat();
    await onMessage(chat, person, { ref: 1, text: "no eggs" });
    expect(suggestSubstitutes).toHaveBeenLastCalledWith("eggs", "en", undefined, undefined);
    await onMessage(chat, person, { ref: 2, text: "no buttermilk", repliedToRecipe: otherId });
    expect(suggestSubstitutes).toHaveBeenLastCalledWith("buttermilk", "en", undefined, undefined);
  });

  it("passes on the substitute they ask about", async () => {
    const { chat } = pretendChat();
    await onMessage(chat, person, { ref: 1, text: "no buttermilk, would yogurt work?" });
    expect(suggestSubstitutes).toHaveBeenCalledWith("buttermilk", "en", undefined, "yogurt");
  });

  it("slows down after too many, per person", async () => {
    vi.mocked(isRateLimited).mockResolvedValueOnce(true);
    const { chat, said } = pretendChat();
    await onMessage(chat, person, { ref: 1, text: "no buttermilk" });
    expect(isRateLimited).toHaveBeenCalledWith("bot-swap:u1", 30, 3600);
    expect(suggestSubstitutes).not.toHaveBeenCalled();
    expect(said).toMatchObject([{ send: WORDS.en["bot.slowDown"] }]);
  });
});

describe("filing a recipe", () => {
  it("from a link: reading, then the recipe in place of the status, then remembers it", async () => {
    vi.mocked(ingest).mockResolvedValueOnce({ recipeId: id, duplicate: null });
    const { chat, said } = pretendChat();
    await onMessage(chat, person, { ref: 7, text: "https://example.test/pancakes" });
    expect(ingest).toHaveBeenCalledWith({ kind: "url", url: "https://example.test/pancakes" }, "u1", "en");
    expect(said).toEqual([
      { react: "reading", ref: 7 },
      { send: expect.stringMatching(/^(👩‍🍳 Reading it…|🍳 On it…|📖 Filing it in the book…)$/), ref: 100, replyTo: undefined, buttons: undefined },
      { edit: expect.stringContaining("🍳 <b>Pancakes</b>"), ref: 100, buttons: expect.any(Array) },
      { react: "saved", ref: 7 },
    ]);
    expect(book).toMatchObject({ lastShown: { id }, rememberedFor: "u1" });
  });

  it("from photos, answering in the caption's language", async () => {
    vi.mocked(ingest).mockResolvedValueOnce({ recipeId: id, duplicate: null });
    const photos = [file("1.jpg", "image/jpeg"), file("2.jpg", "image/jpeg")];
    const { chat } = pretendChat();
    await onMessage(chat, person, { ref: 7, caption: "של סבתא", attachment: { kind: "image", load: async () => photos } });
    expect(ingest).toHaveBeenCalledWith({ kind: "image", caption: "של סבתא", files: photos }, "u1", "he");
  });

  it("from pasted text", async () => {
    vi.mocked(ingest).mockResolvedValueOnce({ recipeId: id, duplicate: null });
    const { chat } = pretendChat();
    await onMessage(chat, person, { ref: 7, text: "/add Pancakes: whisk buttermilk into flour" });
    expect(ingest).toHaveBeenCalledWith({ kind: "text", text: "Pancakes: whisk buttermilk into flour" }, "u1", "en");
  });

  it("says so when there's no recipe in it", async () => {
    vi.mocked(ingest).mockRejectedValueOnce(new NotARecipeError());
    const { chat, said } = pretendChat();
    await onMessage(chat, person, { ref: 7, text: "/add hello" });
    expect(said.slice(2)).toEqual([
      { react: "notRecipe", ref: 7 },
      { edit: MESSAGES.en["err.notRecipe"], ref: 100, buttons: undefined },
    ]);
  });

  it("says so when it fails, and logs which channel it was", async () => {
    vi.mocked(ingest).mockRejectedValueOnce(new Error("boom"));
    const { chat, said } = pretendChat();
    await onMessage(chat, person, { ref: 7, text: "/add hello" });
    expect(said.slice(2)).toEqual([
      { react: "failed", ref: 7 },
      { edit: WORDS.en["bot.failed"], ref: 100, buttons: undefined },
    ]);
    expect(console.error).toHaveBeenCalledWith("pretend import failed", expect.any(Error));
  });

  it("that looks like one in the book asks what to do, with the differences", async () => {
    book.recipes[otherId] = {
      ...pancakes,
      id: otherId,
      title: "Fluffy pancakes",
      ingredients: [line("buttermilk", "250 ml buttermilk"), line("egg", "1 egg")],
    };
    vi.mocked(ingest).mockResolvedValueOnce({ recipeId: otherId, duplicate: { id, title: "Pancakes", similarity: 0.9, overlap: 1 } });
    const { chat, said } = pretendChat();
    await onMessage(chat, person, { ref: 7, text: "https://example.test/fluffy" });
    expect(said.at(-1)).toEqual({
      edit: "👀 Looks like <b>Pancakes</b>, already in the book.\n\n🆕 New: <i>Fluffy pancakes</i>\n➕ New has: EGG\n\nWhat should I do?",
      ref: 100,
      buttons: [
        [{ label: "📌 Keep original", action: { kind: "duplicate", recipeId: otherId, choice: "keep-original", locale: "en" } }],
        [{ label: "🔁 Replace with new", action: { kind: "duplicate", recipeId: otherId, choice: "replace", locale: "en" } }],
        [{ label: "👯 Keep both", action: { kind: "duplicate", recipeId: otherId, choice: "keep-both", locale: "en" } }],
      ],
    });
    // The "reading" reaction stays while they choose.
    expect(said).not.toContainEqual({ react: "saved", ref: 7 });
  });

  it("that looked like a recipe deleted since still asks, with the title it had", async () => {
    vi.mocked(ingest).mockResolvedValueOnce({ recipeId: id, duplicate: { id: otherId, title: "Old pancakes", similarity: 0.9, overlap: 1 } });
    const { chat, said } = pretendChat();
    await onMessage(chat, person, { ref: 7, text: "https://example.test/pancakes" });
    expect(said.at(-1)).toMatchObject({
      edit: expect.stringMatching(/^👀 Looks like <b>Old pancakes<\/b>.*\n🆕 New: <i>Pancakes<\/i>\n➕ New has: BUTTERMILK\n/s),
    });
  });

  it("retries while Google's AI is busy, and says so", async () => {
    vi.useFakeTimers();
    vi.mocked(ingest).mockRejectedValueOnce(new Busy()).mockResolvedValueOnce({ recipeId: id, duplicate: null });
    const { chat, said } = pretendChat();
    const done = onMessage(chat, person, { ref: 7, text: "https://example.test/pancakes" });
    await vi.advanceTimersByTimeAsync(20_000);
    await done;
    expect(ingest).toHaveBeenCalledTimes(2);
    expect(said).toContainEqual({ edit: WORDS.en["bot.busyRetrying"], ref: 100, buttons: undefined });
    expect(said.at(-2)).toMatchObject({ edit: expect.stringContaining("🍳 <b>Pancakes</b>"), ref: 100 });
    expect(said.at(-1)).toEqual({ react: "saved", ref: 7 });
    expect(console.warn).toHaveBeenCalledWith("pretend import: AI busy, retrying in 20s");
  });

  it("gives up after the last retry while the AI stays busy", async () => {
    vi.useFakeTimers();
    vi.mocked(ingest).mockRejectedValueOnce(new Busy()).mockRejectedValueOnce(new Busy()).mockRejectedValueOnce(new Busy());
    const { chat, said } = pretendChat();
    const done = onMessage(chat, person, { ref: 7, text: "https://example.test/pancakes" });
    await vi.advanceTimersByTimeAsync(60_000);
    await done;
    expect(ingest).toHaveBeenCalledTimes(3);
    expect(said.at(-1)).toEqual({ edit: WORDS.en["bot.stillBusy"], ref: 100, buttons: undefined });
    expect(said).toContainEqual({ react: "failed", ref: 7 });
  });

  it("gives up early when another try couldn't finish in time", async () => {
    vi.useFakeTimers();
    vi.mocked(ingest).mockImplementationOnce(async () => {
      await new Promise((r) => setTimeout(r, 70_000));
      throw new Busy();
    });
    const { chat, said } = pretendChat();
    const done = onMessage(chat, person, { ref: 7, text: "https://example.test/pancakes" });
    await vi.advanceTimersByTimeAsync(70_000);
    await done;
    expect(ingest).toHaveBeenCalledTimes(1);
    expect(said.at(-1)).toEqual({ edit: WORDS.en["bot.stillBusy"], ref: 100, buttons: undefined });
  });
});

describe("a voice note", () => {
  it("asking something is answered under what it heard, with a way to save it as a recipe", async () => {
    vi.mocked(hearVoiceNote).mockResolvedValueOnce({ kind: "question", query: "pancakes" });
    const { chat, said } = pretendChat();
    await onMessage(chat, person, { ref: 5, caption: "quick one", attachment: audio });
    expect(hearVoiceNote).toHaveBeenCalledWith(file("note.ogg", "audio/ogg"), "quick one");
    expect(said).toMatchObject([
      { react: "reading", ref: 5 },
      { send: "🎙 I heard: <i>pancakes</i>", replyTo: 5, buttons: [[{ action: { kind: "saveVoice", locale: "en" } }]] },
      { send: expect.stringContaining("Pancakes") },
      { react: "answered", ref: 5 },
    ]);
  });

  it("asking about a recipe they replied to keeps it in mind", async () => {
    vi.mocked(hearVoiceNote).mockResolvedValueOnce({ kind: "question", query: "no buttermilk" });
    const { chat } = pretendChat();
    await onMessage(chat, person, { ref: 5, attachment: audio, repliedToRecipe: id });
    expect(suggestSubstitutes).toHaveBeenCalledWith("buttermilk", "en", expect.objectContaining({ recipeId: id }), undefined);
  });

  it("dictating a recipe is filed", async () => {
    vi.mocked(hearVoiceNote).mockResolvedValueOnce({ kind: "recipe", query: "" });
    vi.mocked(ingest).mockResolvedValueOnce({ recipeId: id, duplicate: null });
    const { chat, said } = pretendChat();
    await onMessage(chat, person, { ref: 5, attachment: audio });
    expect(ingest).toHaveBeenCalledWith({ kind: "audio", caption: undefined, files: [file("note.ogg", "audio/ogg")] }, "u1", "en");
    expect(said.at(-1)).toEqual({ react: "saved", ref: 5 });
  });

  it("that can't be told apart is filed as a recipe", async () => {
    vi.mocked(hearVoiceNote).mockRejectedValueOnce(new Error("no idea"));
    vi.mocked(ingest).mockResolvedValueOnce({ recipeId: id, duplicate: null });
    const { chat } = pretendChat();
    await onMessage(chat, person, { ref: 5, attachment: audio });
    expect(ingest).toHaveBeenCalledWith(expect.objectContaining({ kind: "audio" }), "u1", "en");
    expect(console.error).toHaveBeenCalledWith("voice note: couldn't tell question from recipe", expect.any(Error));
  });

  it("that won't download is tried once more for the import", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce([file("note.ogg", "audio/ogg")]);
    vi.mocked(ingest).mockResolvedValueOnce({ recipeId: id, duplicate: null });
    const { chat } = pretendChat();
    await onMessage(chat, person, { ref: 5, attachment: { kind: "audio", load } });
    expect(hearVoiceNote).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledTimes(2);
    expect(ingest).toHaveBeenCalledWith(expect.objectContaining({ files: [file("note.ogg", "audio/ogg")] }), "u1", "en");
  });
});

describe("showing a recipe", () => {
  const view = (recipeId = id, locale: "en" | "he" = "en") =>
    ({ action: { kind: "view", recipeId, view: "classic", locale }, on: 42 }) as const;

  it("waits for a translation when there's none in their language yet", async () => {
    book.localized = [{ status: "pending", refresh: true }];
    const { chat, said } = pretendChat();
    await onTap(chat, person, view(id, "he"));
    expect(ensureTranslations).toHaveBeenCalledWith(id, ["he"]);
    expect(after).not.toHaveBeenCalled();
    expect(said).toMatchObject([{ edit: expect.stringContaining("Pancakes"), ref: 42 }]);
  });

  it("shows what it has when the recipe goes while it's being translated", async () => {
    book.localized = [{ status: "pending", refresh: true }];
    vi.mocked(ensureTranslations).mockImplementationOnce(async () => {
      delete book.recipes[id];
    });
    const { chat, said } = pretendChat();
    await onTap(chat, person, view(id, "he"));
    expect(said).toMatchObject([{ edit: expect.stringContaining("Pancakes"), ref: 42 }]);
  });

  it("refreshes an old translation after replying", async () => {
    book.localized = [{ status: "outdated", refresh: true }];
    const { chat } = pretendChat();
    await onTap(chat, person, view());
    expect(ensureTranslations).not.toHaveBeenCalled();
    await (vi.mocked(after).mock.calls[0][0] as () => Promise<void>)();
    expect(ensureTranslations).toHaveBeenCalledWith(id, ["en"]);
  });

  it("shows the original it came from, and who added it", async () => {
    book.recipes[id] = { ...pancakes, sourceId: "s1", createdBy: "u2" };
    book.sources.s1 = { kind: "url", url: "https://example.test/pancakes", files: [], text: null };
    book.uploaders.u2 = { displayName: "", username: "mom" };
    const { chat, said } = pretendChat();
    await onTap(chat, person, { action: { kind: "view", recipeId: id, view: "source", locale: "en" }, on: 42 });
    expect(said).toMatchObject([{ edit: expect.stringContaining("🧑‍🍳 Added by mom") }]);
    expect(said).toMatchObject([{ edit: expect.stringContaining("🔗 https://example.test/pancakes") }]);
  });

  it("links to the cookbook when it knows where that is", async () => {
    process.env.APP_URL = "https://book.test/";
    const { chat, said } = pretendChat();
    await onTap(chat, person, view());
    expect(said).toMatchObject([{ buttons: expect.arrayContaining([[{ label: "📖 Open in the cookbook", url: `https://book.test/recipes/${id}` }]]) }]);
  });

  it("says so when the recipe is gone", async () => {
    const { chat, said } = pretendChat();
    await onTap(chat, person, { action: { kind: "open", recipeId: otherId, locale: "en" }, on: 42 });
    expect(said).toEqual([{ send: WORDS.en["bot.gone"], ref: 100, replyTo: undefined, buttons: undefined }]);
  });

  it("still shows it when it can't remember showing it", async () => {
    book.memoryBroken = true;
    const { chat, said } = pretendChat();
    await onTap(chat, person, view());
    expect(said).toHaveLength(1);
    expect(console.error).toHaveBeenCalledWith("couldn't remember the recipe shown", expect.any(Error));
  });
});

describe("its buttons", () => {
  it("switch the recipe on the message to another view", async () => {
    const { chat, said } = pretendChat();
    await onTap(chat, person, { action: { kind: "view", recipeId: id, view: "classic", locale: "he" }, on: 42 });
    expect(said).toEqual([
      {
        edit: expect.stringContaining("• 250 ml buttermilk"),
        ref: 42,
        buttons: [
          [
            { label: "🔥 בישול", action: { kind: "view", recipeId: id, view: "effective", locale: "he" } },
            { label: "· 📜 קלאסי ·", action: { kind: "view", recipeId: id, view: "classic", locale: "he" } },
          ],
          [
            { label: "⚖️ יחסים", action: { kind: "view", recipeId: id, view: "ratios", locale: "he" } },
            { label: "🗂 מקור", action: { kind: "view", recipeId: id, view: "source", locale: "he" } },
          ],
        ],
      },
    ]);
  });

  it("open a recipe from a list as a new message", async () => {
    const { chat, said } = pretendChat();
    await onTap(chat, person, { action: { kind: "open", recipeId: id, locale: "en" }, on: 42 });
    expect(said).toMatchObject([{ send: expect.stringContaining("🍳 <b>Pancakes</b>"), ref: 100 }]);
  });

  it("settle a duplicate, showing the recipe that stays in place of the question", async () => {
    vi.mocked(resolveDuplicate).mockResolvedValueOnce(id);
    const { chat, said } = pretendChat();
    await onTap(chat, person, { action: { kind: "duplicate", recipeId: otherId, choice: "replace", locale: "en" }, on: 42 });
    expect(resolveDuplicate).toHaveBeenCalledWith(otherId, "replace", { userId: "u1", isAdmin: false });
    expect(said).toMatchObject([{ edit: expect.stringContaining("Pancakes"), ref: 42 }]);
  });

  it("say so when a duplicate can't be settled", async () => {
    vi.mocked(resolveDuplicate).mockRejectedValueOnce(new Error("not yours"));
    const { chat, said } = pretendChat();
    await onTap(chat, person, { action: { kind: "duplicate", recipeId: otherId, choice: "replace", locale: "en" }, on: 42 });
    expect(said).toEqual([{ send: WORDS.en["bot.couldnt"], ref: 100, replyTo: undefined, buttons: undefined }]);
    expect(console.error).toHaveBeenCalledWith("duplicate decision failed", expect.any(Error));
  });

  it("save a voice note as a recipe after all, taking the button away", async () => {
    vi.mocked(ingest).mockResolvedValueOnce({ recipeId: id, duplicate: null });
    const { chat, said } = pretendChat();
    await onTap(chat, person, { action: { kind: "saveVoice", locale: "en" }, on: 42, voiceNote: { ref: 5, caption: "gran's", attachment: audio } });
    expect(ingest).toHaveBeenCalledWith({ kind: "audio", caption: "gran's", files: [file("note.ogg", "audio/ogg")] }, "u1", "en");
    expect(said).toMatchObject([
      { removeButtons: 42 },
      { react: "reading", ref: 5 },
      { send: expect.any(String), ref: 100 },
      { edit: expect.stringContaining("Pancakes"), ref: 100 },
      { react: "saved", ref: 5 },
    ]);
  });

  it("can't save a voice note the channel couldn't find, or that isn't one", async () => {
    for (const voiceNote of [null, undefined, { ref: 5, attachment: { kind: "image", load: async () => [] } } as const]) {
      const { chat, said } = pretendChat();
      await onTap(chat, person, { action: { kind: "saveVoice", locale: "en" }, on: 42, voiceNote });
      expect(said).toEqual([{ send: WORDS.en["bot.couldnt"], ref: 100, replyTo: undefined, buttons: undefined }]);
    }
    expect(ingest).not.toHaveBeenCalled();
  });

  it("from before languages answer in the person's language, else the channel's guess", async () => {
    const old = { action: { kind: "view", recipeId: id, view: "classic", locale: null }, on: 42 } as const;
    const inHebrew = pretendChat();
    await onTap(inHebrew.chat, { ...person, locale: "he" }, old);
    expect(inHebrew.said).toMatchObject([{ edit: expect.stringContaining("כמות: 4") }]);
    const guessed = pretendChat("he-IL");
    await onTap(guessed.chat, { ...person, locale: null }, old);
    expect(guessed.said).toMatchObject([{ edit: expect.stringContaining("כמות: 4") }]);
    const fallback = pretendChat();
    await onTap(fallback.chat, { ...person, locale: null }, old);
    expect(fallback.said).toMatchObject([{ edit: expect.stringContaining("makes 4") }]);
  });
});

describe("a correction", () => {
  const fixed = (proposal: Partial<{ ingredients: string[]; steps: string[] }>, isCorrection = true) => ({
    isCorrection,
    summary: "Less buttermilk.",
    recipe: {
      title: "Pancakes",
      servings: "4",
      prepMinutes: null,
      cookMinutes: null,
      totalMinutes: 20,
      ingredients: ["250 ml buttermilk"],
      steps: ["Whisk the buttermilk into the flour."],
      ...proposal,
    },
  });

  it("about the recipe they replied to shows what would change, with Apply and Cancel", async () => {
    vi.mocked(proposeCorrection).mockResolvedValue(fixed({ ingredients: ["200 ml buttermilk"] }));
    const { chat, said } = pretendChat();
    await onMessage(chat, person, { ref: 1, text: "it's 200 ml, not 250", repliedToRecipe: id });
    expect(proposeCorrection).toHaveBeenCalledWith(expect.objectContaining({ ingredients: ["250 ml buttermilk"] }), "it's 200 ml, not 250", "en");
    expect(book.editsInserted).toMatchObject([{ recipeId: id, userId: "u1", baseUpdatedAt: pancakes.updatedAt }]);
    expect(said).toMatchObject([
      {
        send:
          "<b>✏️ Change Pancakes like this?</b>\n<i>Less buttermilk.</i>\n\n<b>Ingredients</b>\n➖ 250 ml buttermilk\n➕ 200 ml buttermilk",
        buttons: [
          [
            { label: "✅ Apply", action: { kind: "fix", editId, choice: "apply" } },
            { label: "✖️ Cancel", action: { kind: "fix", editId, choice: "cancel" } },
          ],
        ],
      },
    ]);
  });

  it("isn't asked of the AI without a recipe in question, unless they say /fix", async () => {
    const { chat, said } = pretendChat();
    await onMessage(chat, person, { ref: 1, text: "it's 200 ml, not 250" });
    expect(proposeCorrection).not.toHaveBeenCalled();
    expect(searchRecipes).toHaveBeenCalled();
    await onMessage(chat, person, { ref: 2, text: "/fix it's 200 ml, not 250" });
    expect(said.at(-1)).toMatchObject({ send: expect.stringMatching(/^✏️ Which recipe\?/) });
  });

  it("that the AI says isn't one is answered as a question", async () => {
    vi.mocked(proposeCorrection).mockResolvedValue(fixed({}, false));
    book.lastShown = { id, at: minutesAgo(5) };
    const { chat, said } = pretendChat();
    await onMessage(chat, person, { ref: 1, text: "should be fine without eggs, right?" });
    expect(proposeCorrection).toHaveBeenCalled();
    expect(book.editsInserted).toEqual([]);
    expect(searchRecipes).toHaveBeenCalled();
    expect(said).toMatchObject([{ send: expect.stringContaining("Pancakes") }]);
  });

  it("that changes nothing says so", async () => {
    vi.mocked(proposeCorrection).mockResolvedValue(fixed({}));
    const { chat, said } = pretendChat();
    await onMessage(chat, person, { ref: 1, text: "/fix it's fine", repliedToRecipe: id });
    expect(said).toMatchObject([{ send: WORDS.en["bot.fixNothing"] }]);
    expect(book.editsInserted).toEqual([]);
  });

  it("of someone else's recipe isn't theirs to make", async () => {
    book.recipes = { [id]: { ...pancakes, createdBy: "someone-else" } };
    const { chat, said } = pretendChat();
    await onMessage(chat, person, { ref: 1, text: "/fix 200 ml", repliedToRecipe: id });
    expect(proposeCorrection).not.toHaveBeenCalled();
    expect(said).toMatchObject([{ send: WORDS.en["bot.fixNotYours"] }]);
  });

  describe("tapped", () => {
    const waiting = (over: Partial<NonNullable<typeof book.edit>> = {}) => {
      book.edit = {
        id: editId,
        recipeId: id,
        userId: "u1",
        proposal: fixed({ ingredients: ["200 ml buttermilk"] }).recipe,
        baseUpdatedAt: pancakes.updatedAt,
        createdAt: new Date(),
        ...over,
      };
    };
    const tap = (choice: "apply" | "cancel") => ({ action: { kind: "fix", editId, choice, locale: "en" } as const, on: 7 });

    it("Apply saves it and shows the recipe in place of the question, once", async () => {
      waiting();
      const { chat, said } = pretendChat();
      await onTap(chat, person, tap("apply"));
      expect(saveCorrection).toHaveBeenCalledWith(id, expect.objectContaining({ ingredients: ["200 ml buttermilk"] }));
      expect(said).toMatchObject([
        { edit: WORDS.en["bot.fixApplying"], ref: 7 },
        { edit: expect.stringContaining("<b>Pancakes</b>"), ref: 7 },
      ]);
      await onTap(chat, person, tap("apply"));
      expect(saveCorrection).toHaveBeenCalledTimes(1);
      expect(said.at(-1)).toMatchObject({ edit: WORDS.en["bot.fixGone"] });
    });

    it("Cancel leaves the recipe as it was", async () => {
      waiting();
      const { chat, said } = pretendChat();
      await onTap(chat, person, tap("cancel"));
      expect(saveCorrection).not.toHaveBeenCalled();
      expect(said).toEqual([{ edit: WORDS.en["bot.fixCancelled"], ref: 7, buttons: undefined }]);
    });

    it("won't apply over a change made since, or someone else's proposal, or an old one", async () => {
      waiting({ baseUpdatedAt: new Date("2025-12-31T00:00:00Z") });
      const { chat, said } = pretendChat();
      await onTap(chat, person, tap("apply"));
      expect(said.at(-1)).toMatchObject({ edit: WORDS.en["bot.fixStale"] });

      waiting({ userId: "someone-else" });
      await onTap(chat, person, tap("apply"));
      expect(said.at(-1)).toMatchObject({ edit: WORDS.en["bot.fixGone"] });

      waiting({ createdAt: new Date(Date.now() - 25 * 3_600_000) });
      await onTap(chat, person, tap("apply"));
      expect(said.at(-1)).toMatchObject({ edit: WORDS.en["bot.fixGone"] });
      expect(saveCorrection).not.toHaveBeenCalled();
    });
  });
});
