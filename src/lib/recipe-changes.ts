// What a change to a recipe changes, line by line, for a "this is what will change" preview
// before it's saved: re-reading a recipe from its original, or a correction sent in chat.

/** A recipe's words as someone would write them: what a correction or a re-read can change. */
export type RecipeText = {
  title: string;
  servings: string | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  totalMinutes: number | null;
  /** One line each, as written: "2 cups flour". */
  ingredients: string[];
  /** One step each. */
  steps: string[];
};

export function recipeText(r: {
  title: string;
  servings: string | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  totalMinutes: number | null;
  ingredients: { original: string }[];
  steps: { text: string }[];
}): RecipeText {
  return {
    title: r.title,
    servings: r.servings,
    prepMinutes: r.prepMinutes,
    cookMinutes: r.cookMinutes,
    totalMinutes: r.totalMinutes,
    ingredients: r.ingredients.map((i) => i.original),
    steps: r.steps.map((s) => s.text),
  };
}

export const DETAILS = ["title", "servings", "prepMinutes", "cookMinutes", "totalMinutes"] as const;
export type Detail = (typeof DETAILS)[number];

export type RecipeDiff = {
  details: { field: Detail; before: string | number | null; after: string | number | null }[];
  ingredients: { removed: string[]; added: string[] };
  steps: { removed: string[]; added: string[] };
};

const tidy = (s: string) => s.replace(/\s+/g, " ").trim();

/** Lines only in `before`, and lines only in `after`, in order. Repeated lines count each time. */
function lines(before: string[], after: string[]) {
  const left = before.map(tidy).filter(Boolean);
  const right = after.map(tidy).filter(Boolean);
  const take = (from: string[], against: string[]) => {
    const pool = [...against];
    return from.filter((line) => {
      const i = pool.indexOf(line);
      if (i < 0) return true;
      pool.splice(i, 1);
      return false;
    });
  };
  return { removed: take(left, right), added: take(right, left) };
}

export function diffRecipe(before: RecipeText, after: RecipeText): RecipeDiff {
  const norm = (v: string | number | null) => (typeof v === "string" ? tidy(v) || null : v);
  return {
    details: DETAILS.filter((f) => norm(before[f]) !== norm(after[f])).map((field) => ({
      field,
      before: before[field],
      after: after[field],
    })),
    ingredients: lines(before.ingredients, after.ingredients),
    steps: lines(before.steps, after.steps),
  };
}

export function isUnchanged(d: RecipeDiff) {
  return !d.details.length && !d.ingredients.removed.length && !d.ingredients.added.length && !d.steps.removed.length && !d.steps.added.length;
}

/** Whether the ingredients or method changed, order included: then the recipe needs re-reading. */
export function contentChanged(before: RecipeText, after: RecipeText) {
  const same = (a: string[], b: string[]) => {
    const x = a.map(tidy).filter(Boolean);
    const y = b.map(tidy).filter(Boolean);
    return x.length === y.length && x.every((line, i) => line === y[i]);
  };
  return !same(before.ingredients, after.ingredients) || !same(before.steps, after.steps);
}
