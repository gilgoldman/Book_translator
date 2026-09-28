import { describe, expect, it } from "vitest";
import type { Action, Button } from "./chat";
import { speaker } from "./language";
import {
  duplicateButtons,
  num,
  openButtons,
  renderAbundance,
  renderRecipe,
  renderResults,
  renderSubstitution,
  saveVoiceButtons,
  variant,
  viewButtons,
  type ShownRecipe,
} from "./render";

const en = speaker("en");
const he = speaker("he");

/** What a set of buttons does, in order. */
const actions = (rows: Button[][]): Action[] => rows.flat().flatMap((b) => ("action" in b ? [b.action] : []));

const id = "0b6c2f7e-1d7e-4a57-9e36-0a5e3f2b8c11";

const recipe: ShownRecipe = {
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

  it("stays under chat apps' message limit", () => {
    const long = { ...recipe, steps: Array.from({ length: 400 }, () => ({ text: "Stir well and wait.", timers: [] })) };
    expect(renderRecipe(long, "classic", en).length).toBeLessThanOrEqual(4000);
  });

  it("speaks Hebrew", () => {
    const out = renderRecipe({ ...recipe, addedBy: "גיל" }, "effective", he);
    expect(out).toContain("צרפתי · אפייה · 🗓 כל השנה · ⏱ 1 שע׳ 15 דק׳ · כמות: 1 tart");
    expect(out).toContain("נוסף על ידי גיל");
    expect(viewButtons(id, "classic", he).flat().map((b) => b.label)).toEqual([
      "🔥 בישול",
      "· 📜 קלאסי ·",
      "⚖️ יחסים",
      "🗂 מקור",
    ]);
  });
});

describe("buttons", () => {
  it("switch between the four views, in the language they were written in, then link to the app", () => {
    const rows = viewButtons(id, "effective", he, "https://book.test");
    expect(actions(rows)).toEqual(
      (["effective", "classic", "ratios", "source"] as const).map((view) => ({ kind: "view", recipeId: id, view, locale: "he" })),
    );
    expect(rows.at(-1)).toEqual([{ label: "📖 לפתוח בספר", url: `https://book.test/recipes/${id}` }]);
    expect(viewButtons(id, "effective", he)).toHaveLength(2);
  });

  it("number recipe lists and open them in the same language", () => {
    const rows = openButtons([{ id, title: "Leek & feta tart" }], en);
    expect(rows).toEqual([[{ label: "1️⃣ Leek & feta tart", action: { kind: "open", recipeId: id, locale: "en" } }]]);
  });

  it("offer the three duplicate choices", () => {
    expect(actions(duplicateButtons(id, he))).toEqual(
      (["keep-original", "replace", "keep-both"] as const).map((choice) => ({ kind: "duplicate", recipeId: id, choice, locale: "he" })),
    );
  });

  it("save a voice note taken as a question", () => {
    expect(actions(saveVoiceButtons(he))).toEqual([{ kind: "saveVoice", locale: "he" }]);
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
    // Channels whose message ids are strings.
    expect(variant("a|b|c", "wamid.123")).toBe(variant("a|b|c", "wamid.123"));
  });

  it("lists search results with what they need", () => {
    const out = renderResults([{ title: "Tart", match: { missing: 2 } }, { title: "Soup", match: { missing: 0 } }, { title: "Pie" }], en);
    expect(out).toBe("1️⃣ Tart — <i>🛒 needs 2 more</i>\n2️⃣ Soup — <i>✅ you have it all</i>\n3️⃣ Pie");
  });
});

describe("ingredient-first replies", () => {
  it("renders swaps", () => {
    const options = [{ use: "Milk + lemon", amount: "250 ml + 1 tbsp", how: "Rest 10 min.", effect: "Nearly the same" }];
    const swap = renderSubstitution("buttermilk", { asked: null, options, tip: null }, en);
    expect(swap).toContain("<b>🔄 No buttermilk? Try:</b>");
    expect(swap).toContain("1️⃣ <b>Milk + lemon</b> — 250 ml + 1 tbsp");
    expect(renderSubstitution("buttermilk", { asked: null, options, tip: null }, en, "Pancakes")).toContain(
      "<b>🔄 No buttermilk for Pancakes? Try:</b>",
    );
  });

  it("answers a named substitute first, then the other options", () => {
    const swap = renderSubstitution(
      "buttermilk",
      {
        asked: { use: "yogurt", verdict: "with-changes", amount: "200 g + 50 ml water", how: "Thin it.", effect: "Tangier" },
        options: [{ use: "Milk + lemon", amount: "250 ml + 1 tbsp", how: "Rest 10 min.", effect: "Nearly the same" }],
        tip: null,
      },
      en,
      "Pancakes",
    );
    expect(swap).toContain("<b>🔄 yogurt instead of buttermilk in Pancakes?</b>");
    expect(swap).toContain("<b>⚠️ Works, with changes</b> — 200 g + 50 ml water");
    expect(swap).toContain("<b>Other options:</b>\n1️⃣ <b>Milk + lemon</b>");
  });

  it("keeps old cached answers without a verdict working", () => {
    const old = { options: [], tip: "Pick another recipe." } as unknown as Parameters<typeof renderSubstitution>[1];
    expect(renderSubstitution("saffron", old, en)).toContain("<b>🔄 No saffron? Try:</b>");
  });

  it("still renders abundance", () => {
    const lots = renderAbundance("leek", [{ title: "Leek & feta tart", amount: "450 g" }], [{ name: "potato" }], en);
    expect(lots).toContain("1️⃣ Leek &amp; feta tart — <i>450 g</i>");
    expect(lots).toContain("💞 Goes well with: potato");
    expect(renderAbundance("leek", [], [], he)).toBe("🤷 עדיין אין מתכונים עם leek.");
  });
});
