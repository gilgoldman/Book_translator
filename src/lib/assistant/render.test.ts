import { describe, expect, it } from "vitest";
import type { Action, Button } from "./chat";
import { speaker } from "./language";
import {
  duplicateButtons,
  num,
  openButtons,
  renderAbundance,
  renderDuplicatePrompt,
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

  it("shows the original: link, files and text, or says there's none", () => {
    const source = {
      kind: "image",
      url: "https://example.test/tart",
      files: [
        { url: "https://blob.test/1.jpg", mediaType: "image/jpeg" },
        { url: "https://blob.test/2.ogg", mediaType: "audio/ogg" },
      ],
      text: "Grandma's <best> tart",
    };
    const out = renderRecipe(recipe, "source", en, source);
    expect(out).toContain("🔗 https://example.test/tart\n🖼 https://blob.test/1.jpg\n🎙 https://blob.test/2.ogg\n\nGrandma's &lt;best&gt; tart");
    expect(renderRecipe(recipe, "source", en)).toContain("<i>🤷 No original saved.</i>");
  });

  it("shows the classic view, and falls back to it without an effective view or ratios", () => {
    const classic = renderRecipe(recipe, "classic", en);
    expect(classic).toContain("• 300 g flour\n• 200 g cold butter");
    expect(classic).toContain("1️⃣ Rub butter into flour, add 100 g water, chill.  ⏱ chill 1 h");
    const plain = { ...recipe, enrichment: null };
    expect(renderRecipe(plain, "effective", en)).toBe(classic);
    expect(renderRecipe(plain, "ratios", en)).toBe(classic);
    // No metric amount: the line as written.
    const unmeasured = { ...recipe, ingredients: [{ ...recipe.ingredients[0], metric: null, original: "a pinch of salt" }] };
    expect(renderRecipe(unmeasured, "classic", en)).toContain("• a pinch of salt\n");
  });

  it("leaves out amounts it doesn't have", () => {
    const e = recipe.enrichment!;
    const vague = {
      ...recipe,
      enrichment: {
        ...e,
        recap: [{ name: "flour", metric: null, volume: null }],
        effectiveSteps: [{ segments: [{ text: "butter", ingredient: 1, metric: null, volume: null }], timers: [] }],
        ratio: { ...e.ratio, components: [{ name: "flour", parts: 3, grams: null }] },
      },
    };
    expect(renderRecipe(vague, "effective", en)).toContain("• flour\n\n1️⃣ <b>butter</b>");
    expect(renderRecipe(vague, "ratios", en)).toContain("🟨🟨🟨 3 flour\n");
    expect(renderRecipe(recipe, "source", en, { kind: "text", url: null, files: [], text: "Just words" })).toMatch(/\n\nJust words$/);
  });

  it("keeps what it doesn't know as stored, and leaves out what's missing", () => {
    const odd = { ...recipe, cuisine: "martian", course: "mystery", season: "monsoon", totalMinutes: null, servings: null, subtitle: "Pâte brisée" };
    const out = renderRecipe(odd, "classic", en);
    expect(out.split("\n").slice(0, 2)).toEqual(["🍴 <b>Pâte brisée</b>", "<i>martian · mystery · monsoon</i>"]);
  });

  it("draws ratios without a family or extras", () => {
    const bare = { ...recipe, enrichment: { ...recipe.enrichment!, ratio: { ...recipe.enrichment!.ratio, family: null, extras: [] } } };
    const out = renderRecipe(bare, "ratios", en);
    expect(out).not.toContain("⚖️");
    expect(out).not.toContain("• salt");
    expect(out).toContain("🟥 1 water (100 g)");
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
    // The website's chat links within the site.
    expect(viewButtons(id, "effective", en, "").at(-1)).toEqual([{ label: "📖 Open in the cookbook", url: `/recipes/${id}` }]);
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

describe("duplicate prompt", () => {
  it("names both recipes and what differs", () => {
    const out = renderDuplicatePrompt("Leek <tart>", "Leek tart", { added: ["feta"], removed: ["egg", "milk"] }, en);
    expect(out).toBe(
      "👀 Looks like <b>Leek tart</b>, already in the book.\n\n🆕 New: <i>Leek &lt;tart&gt;</i>\n➕ New has: feta\n➖ Original has: egg, milk\n\nWhat should I do?",
    );
  });

  it("says when the ingredients are the same", () => {
    expect(renderDuplicatePrompt("Leek tart", "Leek tart", { added: [], removed: [] }, he)).toBe(
      "👀 נראה כמו <b>Leek tart</b>, שכבר בספר.\n\nאותם מצרכים.\n\nמה לעשות?",
    );
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

  it("gives the verdict alone when there's nothing else, with a tip", () => {
    const swap = renderSubstitution(
      "saffron",
      { asked: { use: "turmeric", verdict: "no", amount: null, how: "Only for colour.", effect: "No saffron taste" }, options: [], tip: "Leave it out." },
      en,
    );
    expect(swap).toBe(
      "<b>🔄 turmeric instead of saffron?</b>\n\n<b>❌ Not really</b>\n   Only for colour. <i>No saffron taste</i>\n\n💡 <i>Leave it out.</i>",
    );
    expect(renderSubstitution("saffron", { asked: { use: "safflower", verdict: "yes", amount: null, how: "", effect: "" }, options: [], tip: null }, en)).toContain(
      "<b>✅ Yes, it works</b>",
    );
  });

  it("keeps old cached answers without a verdict working", () => {
    const old = { options: [], tip: "Pick another recipe." } as unknown as Parameters<typeof renderSubstitution>[1];
    expect(renderSubstitution("saffron", old, en)).toContain("<b>🔄 No saffron? Try:</b>");
  });

  it("keeps long answers under chat apps' message limit", () => {
    const options = Array.from({ length: 200 }, () => ({ use: "Milk + lemon", amount: "250 ml", how: "Rest 10 minutes.", effect: "Nearly the same" }));
    expect(renderSubstitution("buttermilk", { asked: null, options, tip: null }, en).length).toBeLessThanOrEqual(4000);
    const uses = Array.from({ length: 300 }, () => ({ title: "Leek & feta tart", amount: null }));
    const lots = renderAbundance("leek", uses, [], en);
    expect(lots.length).toBeLessThanOrEqual(4000);
    expect(lots.endsWith("\n…")).toBe(true);
  });

  it("still renders abundance", () => {
    const lots = renderAbundance("leek", [{ title: "Leek & feta tart", amount: "450 g" }], [{ name: "potato" }], en);
    expect(lots).toContain("1️⃣ Leek &amp; feta tart — <i>450 g</i>");
    expect(lots).toContain("💞 Goes well with: potato");
    expect(renderAbundance("leek", [], [], he)).toBe("🤷 עדיין אין מתכונים עם leek.");
  });
});
