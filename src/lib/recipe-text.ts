import { z } from "zod";
import type { Enrichment, Ingredient, Step } from "@/lib/recipe-types";
import { effectiveSegmentSchema } from "@/lib/recipe-types";

// A recipe's words, apart from its numbers. Translation is a function from this shape to
// the same shape in another language; applying it swaps the words and keeps every
// quantity, timer, ratio and ingredient link from the original, so all the views and
// the units toggle work the same in every language.

const nullableText = z.string().nullable();

export const recipeTextSchema = z.object({
  title: z.string(),
  description: nullableText,
  servings: nullableText.describe('e.g. "4", "1 loaf"'),
  ingredients: z.array(
    z.object({
      group: nullableText,
      name: z.string(),
      note: nullableText,
      metric: nullableText.describe('Keep the numbers, translate the words: "1 medium onion (≈150 g)"'),
      volume: nullableText,
    }),
  ),
  steps: z.array(z.object({ text: z.string(), timers: z.array(z.string()).describe("Timer labels, same order") })),
  recap: z.array(z.object({ name: z.string(), metric: nullableText, volume: nullableText })),
  effectiveSteps: z.array(
    z.object({
      segments: z
        .array(effectiveSegmentSchema)
        .describe("Re-segment freely for natural word order; keep each ingredient index and its amounts"),
      timers: z.array(z.string()),
    }),
  ),
  ratio: z
    .object({
      family: nullableText,
      components: z.array(z.string()).describe("Component names, same order"),
      extras: z.array(z.object({ name: z.string(), amount: z.string() })),
      insight: z.string(),
    })
    .nullable(),
});
export type RecipeText = z.infer<typeof recipeTextSchema>;

/** What's stored per language: the translated words plus the hash of the words they came from. */
export type RecipeTranslation = RecipeText & { hash: string };

export type RecipeContent = {
  title: string;
  description: string | null;
  servings: string | null;
  ingredients: Ingredient[];
  steps: Step[];
  enrichment: Enrichment | null;
};

export function recipeText(r: RecipeContent): RecipeText {
  const e = r.enrichment;
  return {
    title: r.title,
    description: r.description,
    servings: r.servings,
    ingredients: r.ingredients.map((i) => ({
      group: i.group,
      name: i.name,
      note: i.note,
      metric: i.metric,
      volume: i.volume,
    })),
    steps: r.steps.map((s) => ({ text: s.text, timers: s.timers.map((t) => t.label) })),
    recap: e?.recap ?? [],
    effectiveSteps: (e?.effectiveSteps ?? []).map((s) => ({ segments: s.segments, timers: s.timers.map((t) => t.label) })),
    ratio: e
      ? {
          family: e.ratio.family,
          components: e.ratio.components.map((c) => c.name),
          extras: e.ratio.extras,
          insight: e.ratio.insight,
        }
      : null,
  };
}

const sameLength = (a: readonly unknown[], b: readonly unknown[] | undefined) => !!b && a.length === b.length;

/**
 * The recipe with translated words swapped in. Anything whose shape doesn't line up with
 * the original (a missing step, a bad ingredient index) keeps the original words, so a
 * sloppy translation can never break a view.
 */
export function applyText<R extends RecipeContent>(r: R, text: RecipeText): R {
  const ingredients = sameLength(r.ingredients, text.ingredients)
    ? r.ingredients.map((i, k) => ({ ...i, ...text.ingredients[k] }))
    : r.ingredients;

  const steps = sameLength(r.steps, text.steps)
    ? r.steps.map((s, k) => ({
        text: text.steps[k].text,
        timers: sameLength(s.timers, text.steps[k].timers)
          ? s.timers.map((t, j) => ({ ...t, label: text.steps[k].timers[j] }))
          : s.timers,
      }))
    : r.steps;

  let enrichment = r.enrichment;
  if (enrichment) {
    const e = enrichment;
    const validSegments = (segments: RecipeText["effectiveSteps"][number]["segments"]) =>
      segments.every((s) => s.ingredient === null || (s.ingredient >= 0 && s.ingredient < r.ingredients.length));
    const tr = text.ratio;
    enrichment = {
      recap: sameLength(e.recap, text.recap) ? text.recap : e.recap,
      effectiveSteps: sameLength(e.effectiveSteps, text.effectiveSteps)
        ? e.effectiveSteps.map((s, k) => {
            const t = text.effectiveSteps[k];
            return {
              segments: t.segments.length && validSegments(t.segments) ? t.segments : s.segments,
              timers: sameLength(s.timers, t.timers) ? s.timers.map((x, j) => ({ ...x, label: t.timers[j] })) : s.timers,
            };
          })
        : e.effectiveSteps,
      ratio: tr
        ? {
            ...e.ratio,
            family: tr.family,
            insight: tr.insight,
            components: sameLength(e.ratio.components, tr.components)
              ? e.ratio.components.map((c, k) => ({ ...c, name: tr.components[k], role: c.name }))
              : e.ratio.components,
            extras: sameLength(e.ratio.extras, tr.extras) ? tr.extras : e.ratio.extras,
          }
        : e.ratio,
    };
  }

  return {
    ...r,
    title: text.title || r.title,
    description: text.description,
    servings: text.servings,
    ingredients,
    steps,
    enrichment,
  };
}
