import { z } from "zod";

// Shapes the LLM must return. Shared by the extraction prompts, the DB jsonb
// columns and the UI, so the app never parses free text.

export const CUISINES = [
  "italian", "french", "spanish", "greek", "middle-eastern", "north-african",
  "levantine", "persian", "indian", "chinese", "japanese", "korean", "thai",
  "vietnamese", "mexican", "latin-american", "american", "british", "nordic",
  "central-european", "eastern-european", "jewish", "african", "fusion", "other",
] as const;
export const COURSES = [
  "breakfast", "starter", "soup", "salad", "main", "side", "dessert", "baking",
  "bread", "drink", "sauce", "snack", "preserve", "other",
] as const;
export const DIETS = [
  "vegetarian", "vegan", "gluten-free", "dairy-free", "meat", "fish", "kosher",
] as const;
export const SEASONS = ["spring", "summer", "autumn", "winter", "all-year"] as const;

export const ingredientSchema = z.object({
  group: z.string().nullable().describe('Sub-heading such as "For the sauce", or null'),
  name: z.string().describe("Ingredient as written, in the recipe's language, without quantity"),
  canonical: z
    .string()
    .describe('Lowercase English singular base ingredient for search, e.g. "green onion", "butter", "flour"'),
  original: z.string().describe("The full original line, e.g. '2 cups all-purpose flour, sifted'"),
  quantity: z.number().nullable().describe("Numeric amount as written, null for 'to taste'"),
  unit: z.string().nullable().describe("Unit as written (cup, tbsp, g, piece…) or null"),
  grams: z.number().nullable().describe("Best estimate of weight in grams, null if meaningless (e.g. salt to taste)"),
  ml: z.number().nullable().describe("Volume in ml for liquids, else null"),
  volume: z
    .string()
    .nullable()
    .describe('US volumetric rendering, e.g. "1 ¾ cups", "2 tbsp", "1 medium onion"'),
  metric: z
    .string()
    .nullable()
    .describe('Metric rendering, e.g. "220 g", "250 ml", "1 medium onion (≈150 g)"'),
  note: z.string().nullable().describe('Prep note such as "finely chopped", or null'),
  optional: z.boolean(),
});
export type Ingredient = z.infer<typeof ingredientSchema>;

export const timerSchema = z.object({
  label: z.string().describe('Short label, e.g. "Rest dough", "Bake"'),
  seconds: z.number().int().describe("Duration in seconds (use the upper bound of a range)"),
});
export type TimerSpec = z.infer<typeof timerSchema>;

export const stepSchema = z.object({
  text: z.string().describe("The step as written in the source, cleaned up"),
  timers: z.array(timerSchema).describe("Waits/cook times in this step; empty if none"),
});
export type Step = z.infer<typeof stepSchema>;

export const extractedRecipeSchema = z.object({
  isRecipe: z.boolean().describe("False if the input contains no recipe"),
  title: z.string(),
  titleEnglish: z.string().describe("English title (same as title if already English)"),
  description: z.string().nullable().describe("One or two sentence summary, recipe's language"),
  language: z.string().describe("ISO 639-1 code of the recipe text, e.g. en, he, it"),
  servings: z.string().nullable().describe('e.g. "4", "1 loaf", "12 cookies"'),
  prepMinutes: z.number().int().nullable(),
  cookMinutes: z.number().int().nullable(),
  totalMinutes: z.number().int().nullable(),
  ingredients: z.array(ingredientSchema),
  steps: z.array(stepSchema),
  cuisine: z.enum(CUISINES),
  course: z.enum(COURSES),
  diet: z.array(z.enum(DIETS)),
  season: z.enum(SEASONS),
  tags: z
    .array(z.string())
    .describe("Hidden search tags: techniques, equipment, flavours, occasions. Lowercase English, 5-15 items"),
  author: z.string().nullable().describe("Author or site name if known"),
});
export type ExtractedRecipe = z.infer<typeof extractedRecipeSchema>;

// Effective view: steps as segments so embedded quantities can follow the units toggle.
export const effectiveSegmentSchema = z.object({
  text: z
    .string()
    .describe("Plain text, or the ingredient's name when this segment is an ingredient (never empty; no amounts here)"),
  ingredient: z
    .number()
    .int()
    .nullable()
    .describe("Index into the ingredients array when this segment names an ingredient, else null"),
  metric: z.string().nullable().describe('Amount used here in metric, e.g. "100 g"; null for plain text'),
  volume: z.string().nullable().describe('Amount used here in US volume, e.g. "¾ cup"; null for plain text'),
});
export type EffectiveSegment = z.infer<typeof effectiveSegmentSchema>;

/** What an ingredient segment shows: its own words, or the ingredient's name when the model left them out. */
export function segmentText(seg: EffectiveSegment, ingredients: { name: string }[]): string {
  if (seg.ingredient === null || seg.text.trim()) return seg.text;
  return ingredients[seg.ingredient]?.name ?? "";
}

export const ratioSchema = z.object({
  family: z
    .string()
    .nullable()
    .describe('Ruhlman ratio family if it fits, e.g. "Bread dough", "Pie dough", "Custard", "Vinaigrette"; else null'),
  formula: z.string().describe('The ratio in whole parts by weight, e.g. "5 : 3" or "3 : 2 : 1"'),
  components: z
    .array(
      z.object({
        name: z.string(),
        parts: z.number().describe("Parts by weight (small whole numbers or simple halves)"),
        grams: z.number().nullable(),
      }),
    )
    .describe("Core structural ingredients in formula order"),
  extras: z
    .array(z.object({ name: z.string(), amount: z.string().describe('e.g. "2% of flour", "to taste"') }))
    .describe("Seasonings and flavourings relative to the base"),
  insight: z.string().describe("One or two sentences on why the ratio works and how to vary it"),
});
export type Ratio = z.infer<typeof ratioSchema>;

/**
 * Bump when stored effective steps should be rewritten; older ones redo themselves when
 * opened. Then run `npm run translate` so every recipe is redone at once.
 */
export const ENRICHMENT_VERSION = 2;

export type Enrichment = {
  recap: { name: string; metric: string | null; volume: string | null }[];
  effectiveSteps: { segments: EffectiveSegment[]; timers: TimerSpec[] }[];
  ratio: Ratio;
  /** Missing on recipes enriched before version 2. */
  version?: number;
};

// How the model writes an effective step: the sentence with {0}, {1}… where the step's
// ingredients go, and those ingredients listed apart. The sentence's words and the
// ingredient names can't bleed into each other; code turns this into segments.
export const stepIngredientSchema = z.object({
  ingredient: z.number().int().describe("Index into the ingredients array"),
  name: z.string().describe('The ingredient as the sentence calls it, without any amount, e.g. "flour", "egg whites"'),
  metric: z.string().nullable().describe('Amount used in this step in metric, e.g. "100 g", "2 (≈100 g)"; null if none'),
  volume: z.string().nullable().describe('Amount used in this step in US volume, e.g. "¾ cup", "2"; null if none'),
});
export type StepIngredient = z.infer<typeof stepIngredientSchema>;

export const writtenStepSchema = z.object({
  text: z
    .string()
    .describe('The step with {0}, {1}… where ingredients[0], ingredients[1]… go, e.g. "Whisk {0} with {1} until smooth."'),
  ingredients: z.array(stepIngredientSchema).describe("The ingredients this step uses, in the order of their markers"),
  timers: z.array(timerSchema),
});
export type WrittenStep = z.infer<typeof writtenStepSchema>;

/** What the enrich model returns; `writtenToSegments` turns its steps into stored segments. */
export const enrichmentOutputSchema = z.object({
  recap: z
    .array(z.object({ name: z.string(), metric: z.string().nullable(), volume: z.string().nullable() }))
    .describe("Short ingredient recap for the effective view, one line per ingredient, merged duplicates"),
  effectiveSteps: z.array(writtenStepSchema).describe("Rewritten concise steps with quantities embedded inline"),
  ratio: ratioSchema,
});

const MARKER = /\{(\d+)\}/g;

/**
 * Segments from a written step. `complete` is false when a marker points nowhere or an
 * ingredient is left out or used twice; bad markers are dropped from the segments.
 */
export function writtenToSegments(
  text: string,
  ingredients: StepIngredient[],
): { segments: EffectiveSegment[]; complete: boolean } {
  const segments: EffectiveSegment[] = [];
  const used = ingredients.map(() => 0);
  let complete = true;
  let plain = "";
  const flush = () => {
    if (plain) segments.push({ text: plain, ingredient: null, metric: null, volume: null });
    plain = "";
  };
  let last = 0;
  for (const m of text.matchAll(MARKER)) {
    plain += text.slice(last, m.index);
    last = m.index + m[0].length;
    const k = Number(m[1]);
    const ing = ingredients[k];
    if (!ing) {
      complete = false;
      continue;
    }
    used[k]++;
    flush();
    segments.push({ text: ing.name, ingredient: ing.ingredient, metric: ing.metric, volume: ing.volume });
  }
  plain += text.slice(last);
  flush();
  return { segments, complete: complete && used.every((n) => n === 1) };
}

/** The reverse: a stored step as a sentence with markers, for translating. */
export function segmentsToWritten(segments: EffectiveSegment[]): { text: string; ingredients: StepIngredient[] } {
  const ingredients: StepIngredient[] = [];
  let text = "";
  for (const s of segments) {
    if (s.ingredient === null) text += s.text.replace(MARKER, "($1)");
    else {
      text += `{${ingredients.length}}`;
      ingredients.push({ ingredient: s.ingredient, name: s.text, metric: s.metric, volume: s.volume });
    }
  }
  return { text, ingredients };
}

export const substitutionSchema = z.object({
  options: z
    .array(
      z.object({
        use: z.string().describe('What to use, e.g. "Milk + lemon juice"'),
        amount: z
          .string()
          .describe('How much to replace the given amount, e.g. "250 ml milk + 1 tbsp lemon juice"'),
        how: z.string().describe("One short sentence of method, e.g. 'Stir and rest 10 minutes.'"),
        effect: z.string().describe("How the result changes, honestly, in a few words"),
      }),
    )
    .describe("2-3 options, best first. Prefer common pantry items."),
  tip: z.string().nullable().describe("Optional: when it's better to pick another recipe instead"),
});
export type Substitution = z.infer<typeof substitutionSchema>;
