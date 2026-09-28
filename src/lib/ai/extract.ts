import { embed, generateText, Output, type UserContent } from "ai";
import {
  ENRICHMENT_VERSION,
  enrichmentOutputSchema,
  extractedRecipeSchema,
  writtenToSegments,
  type Enrichment,
  type ExtractedRecipe,
} from "@/lib/recipe-types";
import { AI_MAX_RETRIES, ai, embeddingOptions } from "./models";

export type ExtractInput =
  | { kind: "text"; text: string; url?: string }
  | { kind: "files"; files: { data: Uint8Array; mediaType: string }[]; caption?: string };

const EXTRACT_SYSTEM = `You turn recipes into structured data for a personal cookbook.

Rules:
- Be faithful. Never invent ingredients or steps. Fix obvious OCR/speech errors only.
- Keep ingredient names and step text in the recipe's original language. "canonical" and tags are always English.
- For voice notes: the speaker may ramble, repeat or correct themselves; keep the final intent.
- For photos/screenshots: read every part of the image, including handwriting and multiple columns. If several images are given they belong to the same recipe: pages of it, and maybe photos of the finished dish. A dish photo has no recipe text; never read ingredients off it, and list its index in "dishImages".
- Quantities: fill both "metric" and "volume" renderings for every measurable ingredient, converting with realistic densities (flour 125 g per cup, sugar 200 g, butter 227 g, water 240 ml…). Weigh countable items in grams where it helps ("1 medium onion (≈150 g)").
- Timers: add one for every explicit wait or cook time (rest, rise, bake, simmer, chill, marinate). Use the upper bound of ranges.
- Tags: cuisine/course/diet/season are the visible categories; "tags" are hidden search helpers (technique, equipment, key flavours, occasion).
- If there is no recipe in the input, set isRecipe to false and fill the rest minimally.`;

export async function extractRecipe(input: ExtractInput): Promise<ExtractedRecipe> {
  const content: UserContent = [];
  if (input.kind === "text") {
    content.push({
      type: "text",
      text: `${input.url ? `Source URL: ${input.url}\n\n` : ""}Recipe content:\n\n${input.text}`,
    });
  } else {
    content.push({
      type: "text",
      text: `Extract the recipe from the attached ${input.files.length > 1 ? `files (indexes 0-${input.files.length - 1}, in order)` : "file (index 0)"}.${
        input.caption ? `\nThe sender added this note: ${input.caption}` : ""
      }`,
    });
    for (const f of input.files) content.push({ type: "file", data: f.data, mediaType: f.mediaType });
  }

  const { output } = await generateText({
    model: ai.languageModel("extract"),
    maxRetries: AI_MAX_RETRIES,
    system: EXTRACT_SYSTEM,
    messages: [{ role: "user", content }],
    output: Output.object({ schema: extractedRecipeSchema }),
  });
  return output;
}

const ENRICH_SYSTEM = `You are a professional cook preparing two alternative presentations of a recipe.

1. The "effective" view: for someone cooking right now.
   - "recap": a compact ingredient list (merge duplicates, keep the recipe's language).
   - "effectiveSteps": rewrite the method into concise, action-first steps where every quantity is embedded
     at the moment it is used, e.g. "Whisk [100 g flour] with [1 egg] and [a pinch of salt] until smooth."
     Write each step's "text" with a marker {0}, {1}… where each ingredient goes, and list those ingredients
     in "ingredients" in marker order: its index, its name as the sentence would say it (never empty, no amount),
     and just the amount used in that step in both metric and US volume (split amounts correctly when an
     ingredient is used in several steps). The example above is "Whisk {0} with {1} and {2} until smooth."
     with ingredients flour 100 g, egg 1, salt a pinch. Every marker appears once; never put the name in "text".
     Merge trivial steps, split overloaded ones, keep all timers. Keep the recipe's language.

2. The "ratio" view in the spirit of Michael Ruhlman's "Ratio": reduce the recipe to its structural core
   as whole-number parts by weight (e.g. bread 5 : 3 flour : water; pie dough 3 : 2 : 1 flour : fat : water;
   custard 2 : 1 liquid : egg; vinaigrette 3 : 1 oil : acid). Choose the base ingredient that defines the dish.
   Round to simple whole parts (halves allowed) and name the family when one fits. Put seasonings and
   flavourings in "extras" relative to the base (e.g. "salt 2% of flour"). For dishes without a meaningful
   ratio (e.g. a salad), give the proportions of the main components anyway and say so in "insight".
   Write every text in the recipe's language; the app translates it for other readers.`;

type EnrichInput = Pick<ExtractedRecipe, "title" | "servings" | "steps"> & {
  ingredients: Pick<ExtractedRecipe["ingredients"][number], "name" | "original" | "grams" | "ml" | "metric" | "volume" | "note">[];
};

export async function enrichRecipe(recipe: EnrichInput): Promise<Enrichment> {
  const { output } = await generateText({
    model: ai.languageModel("enrich"),
    maxRetries: AI_MAX_RETRIES,
    system: ENRICH_SYSTEM,
    prompt: JSON.stringify({
      title: recipe.title,
      servings: recipe.servings,
      ingredients: recipe.ingredients.map((i, index) => ({
        index,
        name: i.name,
        original: i.original,
        grams: i.grams,
        ml: i.ml,
        metric: i.metric,
        volume: i.volume,
        note: i.note,
      })),
      steps: recipe.steps,
    }),
    output: Output.object({ schema: enrichmentOutputSchema }),
  });
  const known = (i: number) => i >= 0 && i < recipe.ingredients.length;
  return {
    recap: output.recap,
    ratio: output.ratio,
    effectiveSteps: output.effectiveSteps.map((s) => ({
      timers: s.timers,
      // An ingredient index that points nowhere still reads fine as plain words.
      segments: writtenToSegments(s.text, s.ingredients).segments.map((seg) =>
        seg.ingredient === null || known(seg.ingredient)
          ? seg
          : { text: [seg.metric, seg.text].filter(Boolean).join(" "), ingredient: null, metric: null, volume: null },
      ),
    })),
    version: ENRICHMENT_VERSION,
  };
}

export function embeddingText(r: {
  titleEnglish: string;
  title: string;
  description: string | null;
  cuisine: string;
  course: string;
  diet: string[];
  season: string;
  tags: string[];
  ingredients: { canonical: string }[];
}) {
  return [
    r.titleEnglish,
    r.title !== r.titleEnglish ? r.title : "",
    r.description ?? "",
    `${r.cuisine} ${r.course} ${r.season} ${r.diet.join(" ")}`,
    `Ingredients: ${r.ingredients.map((i) => i.canonical).join(", ")}`,
    `Tags: ${r.tags.join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function embedText(value: string): Promise<number[]> {
  const { embedding } = await embed({
    model: ai.embeddingModel("text"),
    maxRetries: AI_MAX_RETRIES,
    value,
    providerOptions: embeddingOptions,
  });
  return embedding;
}
