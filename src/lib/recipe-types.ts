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

export const enrichmentSchema = z.object({
  recap: z
    .array(z.object({ name: z.string(), metric: z.string().nullable(), volume: z.string().nullable() }))
    .describe("Short ingredient recap for the effective view, one line per ingredient, merged duplicates"),
  effectiveSteps: z
    .array(
      z.object({
        segments: z.array(effectiveSegmentSchema),
        timers: z.array(timerSchema),
      }),
    )
    .describe("Rewritten concise steps with quantities embedded inline"),
  ratio: ratioSchema,
});
export type Enrichment = z.infer<typeof enrichmentSchema>;

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
