import { describe, expect, it } from "vitest";
import { applyText, recipeText, type RecipeContent } from "./recipe-text";
import { segmentsToWritten, segmentText, writtenToSegments } from "./recipe-types";

const ing = (name: string, metric: string, canonical = name) => ({
  group: null, name, canonical, original: `${metric} ${name}`, quantity: null, unit: null,
  grams: 100, ml: null, volume: "1 cup", metric, note: null, optional: false,
});

const recipe: RecipeContent = {
  title: "Leek tart",
  description: "Crisp and green.",
  servings: "4",
  ingredients: [ing("leeks", "300 g", "leek"), ing("eggs", "2 large", "egg")],
  steps: [{ text: "Sweat the leeks.", timers: [{ label: "Sweat", seconds: 600 }] }],
  enrichment: {
    recap: [{ name: "leeks", metric: "300 g", volume: "3 cups" }],
    effectiveSteps: [
      {
        segments: [
          { text: "Sweat ", ingredient: null, metric: null, volume: null },
          { text: "leeks", ingredient: 0, metric: "300 g", volume: "3 cups" },
        ],
        timers: [{ label: "Sweat", seconds: 600 }],
      },
    ],
    ratio: {
      family: null,
      formula: "3 : 1",
      components: [{ name: "leek", parts: 3, grams: 300 }, { name: "egg", parts: 1, grams: 100 }],
      extras: [],
      insight: "Mostly leek.",
    },
  },
};

const hebrew = {
  title: "טארט כרישה",
  description: "פריך וירוק.",
  servings: "4",
  ingredients: [
    { group: null, name: "כרישות", note: null, metric: "300 גרם", volume: "3 כוסות" },
    { group: null, name: "ביצים", note: null, metric: "2 גדולות", volume: "1 כוס" },
  ],
  steps: [{ text: "מאדים את הכרישות.", timers: ["אידוי"] }],
  recap: [{ name: "כרישות", metric: "300 גרם", volume: "3 כוסות" }],
  effectiveSteps: [
    {
      text: "מאדים {0}",
      ingredients: [{ name: "כרישות", metric: "300 גרם", volume: "3 כוסות" }],
      timers: ["אידוי"],
    },
  ],
  ratio: { family: null, components: ["כרישה", "ביצה"], extras: [], insight: "בעיקר כרישה." },
};

describe("recipe text", () => {
  it("round-trips a recipe's words", () => {
    expect(applyText(recipe, recipeText(recipe))).toEqual({
      ...recipe,
      enrichment: {
        ...recipe.enrichment,
        ratio: {
          ...recipe.enrichment!.ratio,
          components: recipe.enrichment!.ratio.components.map((c) => ({ ...c, role: c.name })),
        },
      },
    });
  });

  it("swaps in translated words and keeps every number and link", () => {
    const he = applyText(recipe, hebrew);
    expect(he.title).toBe("טארט כרישה");
    expect(he.ingredients[0]).toMatchObject({ name: "כרישות", canonical: "leek", grams: 100, metric: "300 גרם" });
    expect(he.steps[0]).toEqual({ text: "מאדים את הכרישות.", timers: [{ label: "אידוי", seconds: 600 }] });
    expect(he.enrichment!.effectiveSteps[0].segments[1]).toMatchObject({ ingredient: 0, text: "כרישות" });
    expect(he.enrichment!.ratio.components[0]).toMatchObject({ name: "כרישה", parts: 3, role: "leek" });
    expect(he.enrichment!.ratio.formula).toBe("3 : 1");
  });

  it("keeps the original words where a translation doesn't line up", () => {
    const broken = applyText(recipe, {
      ...hebrew,
      ingredients: hebrew.ingredients.slice(0, 1),
      effectiveSteps: [{ text: "מאדים {3}", ingredients: hebrew.effectiveSteps[0].ingredients, timers: ["אידוי"] }],
    });
    expect(broken.title).toBe("טארט כרישה");
    expect(broken.ingredients).toEqual(recipe.ingredients);
    expect(broken.enrichment!.effectiveSteps[0].segments).toEqual(recipe.enrichment!.effectiveSteps[0].segments);
    expect(broken.enrichment!.effectiveSteps[0].timers[0].label).toBe("אידוי");
  });

  it("lets a translation move ingredients anywhere in the sentence, and never loses their names", () => {
    const whites = ing("egg whites", "4 (≈132 g)", "egg white");
    const sugar = ing("sugar", "100 g");
    const r: RecipeContent = {
      ...recipe,
      ingredients: [sugar, whites],
      enrichment: {
        ...recipe.enrichment!,
        effectiveSteps: [
          {
            segments: [
              { text: "מקציפים ", ingredient: null, metric: null, volume: null },
              { text: "חלבונים", ingredient: 1, metric: "4 (≈132 גרם)", volume: "4" },
              { text: " עם ", ingredient: null, metric: null, volume: null },
              { text: "סוכר", ingredient: 0, metric: "100 גרם", volume: "½ כוס" },
              { text: " לקצף יציב.", ingredient: null, metric: null, volume: null },
            ],
            timers: [],
          },
        ],
      },
    };
    const text = recipeText(r);
    expect(text.effectiveSteps[0].text).toBe("מקציפים {0} עם {1} לקצף יציב.");
    const english = {
      ...text,
      effectiveSteps: [
        {
          text: "Whip {0} with {1} to a stiff, stable foam.",
          ingredients: [
            { name: "egg whites", metric: "4 (≈132 g)", volume: "4" },
            { name: "sugar", metric: "100 g", volume: "½ cup" },
          ],
          timers: [],
        },
      ],
    };
    expect(applyText(r, english).enrichment!.effectiveSteps[0].segments).toEqual([
      { text: "Whip ", ingredient: null, metric: null, volume: null },
      { text: "egg whites", ingredient: 1, metric: "4 (≈132 g)", volume: "4" },
      { text: " with ", ingredient: null, metric: null, volume: null },
      { text: "sugar", ingredient: 0, metric: "100 g", volume: "½ cup" },
      { text: " to a stiff, stable foam.", ingredient: null, metric: null, volume: null },
    ]);
    // A translation that drops an ingredient keeps the original step instead.
    const dropped = { ...english, effectiveSteps: [{ ...english.effectiveSteps[0], text: "Whip {0} to a foam." }] };
    expect(applyText(r, dropped).enrichment!.effectiveSteps[0].segments).toEqual(r.enrichment!.effectiveSteps[0].segments);
  });
});

describe("written steps", () => {
  const uses = [
    { ingredient: 2, name: "flour", metric: "150 g", volume: "1¼ cups" },
    { ingredient: 0, name: "butter", metric: "100 g", volume: "7 tbsp" },
  ];

  it("fills each marker with its ingredient, keeping the words apart", () => {
    expect(writtenToSegments("Pulse {0} with {1} until crumbly.", uses)).toEqual({
      complete: true,
      segments: [
        { text: "Pulse ", ingredient: null, metric: null, volume: null },
        { text: "flour", ingredient: 2, metric: "150 g", volume: "1¼ cups" },
        { text: " with ", ingredient: null, metric: null, volume: null },
        { text: "butter", ingredient: 0, metric: "100 g", volume: "7 tbsp" },
        { text: " until crumbly.", ingredient: null, metric: null, volume: null },
      ],
    });
  });

  it("flags unknown, missing or repeated markers", () => {
    expect(writtenToSegments("Pulse {0} with {5}.", uses)).toMatchObject({ complete: false });
    expect(writtenToSegments("Pulse {0}.", uses).complete).toBe(false);
    expect(writtenToSegments("Pulse {0}, {0} and {1}.", uses).complete).toBe(false);
    expect(writtenToSegments("Pulse {0} with {5}.", uses).segments.map((s) => s.text).join("")).toBe("Pulse flour with .");
  });

  it("round-trips stored segments", () => {
    const { segments } = writtenToSegments("Pulse {0} with {1} until crumbly.", uses);
    const written = segmentsToWritten(segments);
    expect(written).toEqual({ text: "Pulse {0} with {1} until crumbly.", ingredients: uses });
    expect(writtenToSegments(written.text, written.ingredients).segments).toEqual(segments);
  });
});

describe("segmentText", () => {
  const ingredients = [{ name: "sugar" }, { name: "egg whites" }];
  it("keeps the segment's own words", () => {
    expect(segmentText({ text: "whites", ingredient: 1, metric: null, volume: null }, ingredients)).toBe("whites");
  });
  it("falls back to the ingredient's name when the model left it empty", () => {
    expect(segmentText({ text: " ", ingredient: 0, metric: "100 g", volume: "½ cup" }, ingredients)).toBe("sugar");
  });
});
