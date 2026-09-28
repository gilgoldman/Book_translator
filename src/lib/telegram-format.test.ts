import { describe, expect, it } from "vitest";
import {
  classifyText,
  duplicateKeyboard,
  num,
  openKeyboard,
  parseCallback,
  parseDuplicateCallback,
  renderAbundance,
  renderRecipe,
  renderResults,
  renderSubstitution,
  variant,
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
    expect(out).toContain("🥧 <b>Pâte brisée</b>");
    expect(out).toContain("<i>Shortcrust pastry</i>");
    expect(out).toContain("French · Baking · 🗓 All year · ⏱ 1 h 15 · makes 1 tart");
    expect(renderRecipe({ ...recipe, addedBy: "Gil" }, "effective", en)).toContain("Added by Gil");
    expect(out).toContain("1️⃣ Rub <b>200 g butter</b>");
    expect(out).toContain("&amp; &lt;chill&gt;");
    expect(out).toContain("⏱ chill 1 h");
  });

  it("renders ratios as coloured bars, one colour per component", () => {
    const out = renderRecipe(recipe, "ratios", en);
    expect(out).toContain("<code>3 : 2 : 1</code>");
    expect(out).toContain("🟨🟨🟨 3 flour (300 g)");
    expect(out).toContain("🟧🟧 2 fat (200 g)");
    expect(out).toContain("💡 <i>Less water, more tender.</i>");
  });

  it("stays under Telegram's limit", () => {
    const long = { ...recipe, steps: Array.from({ length: 400 }, () => ({ text: "Stir well and wait.", timers: [] })) };
    expect(renderRecipe(long, "classic", en).length).toBeLessThanOrEqual(4000);
  });

  it("speaks Hebrew", () => {
    const out = renderRecipe({ ...recipe, addedBy: "גיל" }, "effective", he);
    expect(out).toContain("צרפתי · אפייה · 🗓 כל השנה · ⏱ 1 שע׳ 15 דק׳ · כמות: 1 tart");
    expect(out).toContain("נוסף על ידי גיל");
    expect(viewKeyboard(id, "classic", he).inline_keyboard.flat().map((b) => b.text)).toEqual([
      "🔥 בישול",
      "· 📜 קלאסי ·",
      "⚖️ יחסים",
      "🗂 מקור",
    ]);
  });
});

describe("callbacks", () => {
  it("round-trips view buttons within 64 bytes, in the language they were written in", () => {
    const kb = viewKeyboard(id, "effective", he, "https://book.test");
    const views = kb.inline_keyboard.flat().filter((b) => b.callback_data);
    expect(views).toHaveLength(4);
    for (const b of views) {
      expect(Buffer.byteLength(b.callback_data!)).toBeLessThanOrEqual(64);
      expect(parseCallback(b.callback_data!)).toMatchObject({ id, locale: "he" });
    }
    expect(kb.inline_keyboard.at(-1)).toEqual([{ text: "📖 לפתוח בספר", url: `https://book.test/recipes/${id}` }]);
    expect(parseCallback("v:nope:effective")).toBeNull();
    // Buttons sent before they carried a language still work.
    expect(parseCallback(`o:${id}`)).toEqual({ id, view: "effective", open: true, locale: null });
    expect(parseCallback(`v:${id}:ratios`)).toEqual({ id, view: "ratios", open: false, locale: null });
  });

  it("numbers recipe lists and opens them in the same language", () => {
    const kb = openKeyboard([{ id, title: "Leek & feta tart" }], en);
    expect(kb.inline_keyboard[0][0].text).toBe("1️⃣ Leek & feta tart");
    expect(parseCallback(kb.inline_keyboard[0][0].callback_data)).toEqual({ id, view: "effective", open: true, locale: "en" });
    const long = openKeyboard([{ id, title: "🥧".repeat(80) }], en).inline_keyboard[0][0].text;
    expect([...long]).toHaveLength(60);
  });
});

describe("little touches", () => {
  it("numbers with keycaps, then plainly", () => {
    expect([1, 10, 11].map(num)).toEqual(["1️⃣", "🔟", "11."]);
  });

  it("picks the same variant for the same message", () => {
    expect(variant("a|b|c", 4)).toBe("b");
    expect(variant("a|b|c", 4)).toBe(variant("a|b|c", 4));
    expect(variant("only", 7)).toBe("only");
  });

  it("lists search results with what they need", () => {
    const out = renderResults([{ title: "Tart", match: { missing: 2 } }, { title: "Soup", match: { missing: 0 } }, { title: "Pie" }], en);
    expect(out).toBe("1️⃣ Tart — <i>🛒 needs 2 more</i>\n2️⃣ Soup — <i>✅ you have it all</i>\n3️⃣ Pie");
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
    const rows = duplicateKeyboard(id, he).inline_keyboard.flat();
    expect(rows.map((b) => parseDuplicateCallback(b.callback_data)?.choice)).toEqual([
      "keep-original",
      "replace",
      "keep-both",
    ]);
    expect(rows.every((b) => parseDuplicateCallback(b.callback_data)?.locale === "he")).toBe(true);
    expect(parseDuplicateCallback(`d:${id}:o`)).toEqual({ id, choice: "keep-original", locale: null });
    expect(parseDuplicateCallback(`d:${id}:x`)).toBeNull();
  });
});

describe("ingredient-first replies", () => {
  it("renders swaps and abundance lists", () => {
    const swap = renderSubstitution("buttermilk", {
      options: [{ use: "Milk + lemon", amount: "250 ml + 1 tbsp", how: "Rest 10 min.", effect: "Nearly the same" }],
      tip: null,
    }, en);
    expect(swap).toContain("<b>🔄 No buttermilk? Try:</b>");
    expect(swap).toContain("1️⃣ <b>Milk + lemon</b> — 250 ml + 1 tbsp");
    const lots = renderAbundance("leek", [{ title: "Leek & feta tart", amount: "450 g" }], [{ name: "potato" }], en);
    expect(lots).toContain("1️⃣ Leek &amp; feta tart — <i>450 g</i>");
    expect(lots).toContain("💞 Goes well with: potato");
    expect(renderAbundance("leek", [], [], he)).toBe("🤷 עדיין אין מתכונים עם leek.");
  });
});
