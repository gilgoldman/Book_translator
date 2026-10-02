import { describe, expect, it } from "vitest";
import { contentChanged, diffRecipe, isUnchanged, type RecipeText } from "./recipe-changes";

const base: RecipeText = {
  title: "Shakshuka",
  servings: "4",
  prepMinutes: 10,
  cookMinutes: 20,
  totalMinutes: 30,
  ingredients: ["4 eggs", "1 onion", "1 tsp cumin"],
  steps: ["Fry the onion.", "Add the eggs and bake at 200°C."],
};

describe("diffRecipe", () => {
  it("lists the lines that go and come, and the details that change", () => {
    const after = { ...base, totalMinutes: 35, ingredients: ["3 eggs", "1 onion", "1 tsp cumin"], steps: ["Fry the onion.", "Add the eggs and bake at 180°C."] };
    expect(diffRecipe(base, after)).toEqual({
      details: [{ field: "totalMinutes", before: 30, after: 35 }],
      ingredients: { removed: ["4 eggs"], added: ["3 eggs"] },
      steps: { removed: ["Add the eggs and bake at 200°C."], added: ["Add the eggs and bake at 180°C."] },
    });
  });

  it("ignores spacing, and counts a repeated line each time", () => {
    expect(isUnchanged(diffRecipe(base, { ...base, title: " Shakshuka ", ingredients: ["4  eggs", "1 onion", "1 tsp cumin"] }))).toBe(true);
    expect(diffRecipe({ ...base, ingredients: ["salt", "salt"] }, { ...base, ingredients: ["salt"] }).ingredients).toEqual({
      removed: ["salt"],
      added: [],
    });
  });
});

describe("contentChanged", () => {
  it("is about ingredients and method, order included, not details", () => {
    expect(contentChanged(base, { ...base, title: "Eggs", servings: "2" })).toBe(false);
    expect(contentChanged(base, { ...base, steps: [...base.steps].reverse() })).toBe(true);
    expect(contentChanged(base, { ...base, ingredients: [...base.ingredients, "feta"] })).toBe(true);
  });
});
