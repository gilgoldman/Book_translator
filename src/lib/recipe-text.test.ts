import { describe, expect, it } from "vitest";
import { applyText, recipeText, type RecipeContent } from "./recipe-text";
import { segmentText } from "./recipe-types";

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
      segments: [
        { text: "מאדים ", ingredient: null, metric: null, volume: null },
        { text: "כרישות", ingredient: 0, metric: "300 גרם", volume: "3 כוסות" },
      ],
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
      effectiveSteps: [{ segments: [{ text: "x", ingredient: 7, metric: null, volume: null }], timers: ["אידוי"] }],
    });
    expect(broken.title).toBe("טארט כרישה");
    expect(broken.ingredients).toEqual(recipe.ingredients);
    expect(broken.enrichment!.effectiveSteps[0].segments).toEqual(recipe.enrichment!.effectiveSteps[0].segments);
    expect(broken.enrichment!.effectiveSteps[0].timers[0].label).toBe("אידוי");
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
