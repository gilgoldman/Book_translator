import { describe, expect, it } from "vitest";
import {
  classifyText,
  duplicateKeyboard,
  parseCallback,
  parseDuplicateCallback,
  renderAbundance,
  renderRecipe,
  renderSubstitution,
  viewKeyboard,
  type TgRecipe,
} from "./telegram-format";
import { translatorFor } from "./i18n/translator-for";

const en = translatorFor("en");
const he = translatorFor("he");

const id = "0b6c2f7e-1d7e-4a57-9e36-0a5e3f2b8c11";

const recipe: TgRecipe = {
  id,
  title: "Pâte brisée",
  subtitle: "Shortcrust pastry",
  cuisine: "french",
  course: "baking",
  season: "all-year",
  totalMinutes: 75,
  servings: "1 tart",
  ingredients: [
    { group: null, name: "flour", canonical: "flour", original: "300 g flour", quantity: 300, unit: "g", grams: 300, ml: null, volume: "2 ⅖ cups", metric: "300 g", note: null, optional: false },
    { group: null, name: "cold butter", canonical: "butter", original: "200 g butter", quantity: 200, unit: "g", grams: 200, ml: null, volume: "⅞ cup", metric: "200 g", note: "cubed", optional: false },
  ],
  steps: [{ text: "Rub butter into flour, add 100 g water, chill.", timers: [{ label: "Chill", seconds: 3600 }] }],
  enrichment: {
    recap: [{ name: "flour", metric: "300 g", volume: "2 ⅖ cups" }],
    effectiveSteps: [
      {
        segments: [
          { text: "Rub ", ingredient: null, metric: null, volume: null },
          { text: "butter", ingredient: 1, metric: "200 g", volume: "⅞ cup" },
          { text: " into the flour & <chill>.", ingredient: null, metric: null, volume: null },
        ],
        timers: [{ label: "Chill", seconds: 3600 }],
      },
    ],
    ratio: {
      family: "Pie dough",
      formula: "3 : 2 : 1",
      components: [
        { name: "flour", parts: 3, grams: 300 },
        { name: "fat", parts: 2, grams: 200 },
        { name: "water", parts: 1, grams: 100 },
      ],
      extras: [{ name: "salt", amount: "1% of flour" }],
      insight: "Less water, more tender.",
    },
  },
};

describe("renderRecipe", () => {
  it("renders the effective view with inline quantities and escaped text", () => {
    const out = renderRecipe(recipe, "effective", en);
    expect(out).toContain("<b>Pâte brisée</b>");
    expect(out).toContain("<i>Shortcrust pastry</i>");
    expect(out).toContain("French · Baking · All year · 1 h 15 · makes 1 tart");
    expect(renderRecipe({ ...recipe, addedBy: "Gil" }, "effective", en)).toContain("Added by Gil");
    expect(out).toContain("<b>200 g butter</b>");
    expect(out).toContain("&amp; &lt;chill&gt;");
    expect(out).toContain("⏱ chill 1 h");
  });

  it("renders ratios as simple bars", () => {
    const out = renderRecipe(recipe, "ratios", en);
    expect(out).toContain("<code>3 : 2 : 1</code>");
    expect(out).toContain("▮▮▮ 3 flour (300 g)");
  });

  it("stays under Telegram's limit", () => {
    const long = { ...recipe, steps: Array.from({ length: 400 }, () => ({ text: "Stir well and wait.", timers: [] })) };
    expect(renderRecipe(long, "classic", en).length).toBeLessThanOrEqual(4000);
  });

  it("speaks Hebrew", () => {
    const out = renderRecipe({ ...recipe, addedBy: "גיל" }, "effective", he);
    expect(out).toContain("צרפתי · אפייה · כל השנה · 1 שע׳ 15 דק׳ · כמות: 1 tart");
    expect(out).toContain("נוסף על ידי גיל");
    expect(viewKeyboard(id, "classic", he).inline_keyboard[0].map((b) => b.text)).toEqual([
      "בישול",
      "· קלאסי ·",
      "יחסים",
      "מקור",
    ]);
  });
});

describe("callbacks", () => {
  it("round-trips view buttons within 64 bytes", () => {
    const kb = viewKeyboard(id, "effective", en, "https://book.test");
    for (const b of kb.inline_keyboard[0]) {
      expect(Buffer.byteLength(b.callback_data!)).toBeLessThanOrEqual(64);
      expect(parseCallback(b.callback_data!)?.id).toBe(id);
    }
    expect(parseCallback("v:nope:effective")).toBeNull();
    expect(parseCallback(`o:${id}`)).toEqual({ id, view: "effective", open: true });
  });
});

describe("classifyText", () => {
  it("understands commands", () => {
    expect(classifyText("/login gil secret pass")).toEqual({ kind: "login", username: "gil", password: "secret pass" });
    expect(classifyText("/find leeks")).toEqual({ kind: "search", query: "leeks" });
  });

  it("treats a bare link as an import", () => {
    expect(classifyText("https://example.test/tatin")).toEqual({ kind: "url", url: "https://example.test/tatin" });
  });

  it("treats short text as a search and long text as a pasted recipe", () => {
    expect(classifyText("leeks, eggs, feta")).toEqual({ kind: "search", query: "leeks, eggs, feta" });
    expect(classifyText("Soup\n2 leeks\n1 l stock\nSweat leeks\nAdd stock").kind).toBe("import");
  });
});

describe("duplicate prompt", () => {
  it("round-trips the three choices", () => {
    const rows = duplicateKeyboard(id, en).inline_keyboard.flat();
    expect(rows.map((b) => parseDuplicateCallback(b.callback_data)?.choice)).toEqual([
      "keep-original",
      "replace",
      "keep-both",
    ]);
    expect(parseDuplicateCallback(`d:${id}:x`)).toBeNull();
  });
});

describe("ingredient-first replies", () => {
  it("renders swaps and abundance lists", () => {
    const swap = renderSubstitution("buttermilk", {
      options: [{ use: "Milk + lemon", amount: "250 ml + 1 tbsp", how: "Rest 10 min.", effect: "Nearly the same" }],
      tip: null,
    }, en);
    expect(swap).toContain("<b>No buttermilk? Try:</b>");
    expect(swap).toContain("<b>Milk + lemon</b> — 250 ml + 1 tbsp");
    const lots = renderAbundance("leek", [{ title: "Leek & feta tart", amount: "450 g" }], [{ name: "potato" }], en);
    expect(lots).toContain("1. Leek &amp; feta tart — <i>450 g</i>");
    expect(lots).toContain("Goes well with: potato");
  });
});
