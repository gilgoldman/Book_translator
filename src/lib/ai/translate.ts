import { generateText, Output } from "ai";
import { z } from "zod";
import { recipeTextSchema, type RecipeText } from "@/lib/recipe-text";
import { ai } from "./models";

const SYSTEM = `You translate recipes for a family cookbook.

- You get a recipe's words as JSON. Return the same JSON shape with every text value translated.
- Arrays keep the same length and order: the app pairs them with the original quantities.
- Write like a good cookbook in the target language: natural, warm, concise. Use the usual
  local names of ingredients and dishes; keep a dish's name when it is normally left as is.
- Amount strings ("metric", "volume", "amount"): keep numbers, fractions and symbols, translate
  the words and units into what cooks in that language write ("2 tbsp" -> "2 כפות").
- "effectiveSteps" segments: reorder or re-split them so the sentence reads naturally, but keep
  every ingredient segment's "ingredient" index, and its "metric"/"volume" amounts (translated).
  Plain text segments have ingredient, metric and volume set to null. Mind the spaces between segments.
- Never add, drop or merge ingredients, steps or timers.`;

export async function translateRecipeText(text: RecipeText, languageName: string): Promise<RecipeText> {
  const { output } = await generateText({
    model: ai.languageModel("translate"),
    system: SYSTEM,
    prompt: `Translate into ${languageName}.\n\n${JSON.stringify(text)}`,
    output: Output.object({ schema: recipeTextSchema }),
  });
  return output;
}

const namesSchema = z.object({
  names: z.array(
    z.object({
      canonical: z.string().describe("The English name exactly as given"),
      singular: z.string(),
      plural: z.string().describe("Plural, or the same word for uncountables"),
    }),
  ),
});

/** Everyday names for canonical English ingredients ("leek") in another language. */
export async function translateIngredientNames(canonicals: string[], languageName: string) {
  const { output } = await generateText({
    model: ai.languageModel("quick"),
    system: `You name cooking ingredients in ${languageName}, as a home cook would say them, without articles or prefixes.`,
    prompt: `Name each of these ingredients:\n${canonicals.join("\n")}`,
    output: Output.object({ schema: namesSchema }),
  });
  return output.names;
}

/** "כרישות" -> "leek": the canonical English name we index ingredients by. */
export async function canonicalIngredient(text: string): Promise<string> {
  const { output } = await generateText({
    model: ai.languageModel("quick"),
    system:
      'Give the lowercase English singular base name of the cooking ingredient the user names, e.g. "green onion", "butter", "flour". Only the name.',
    prompt: text,
    output: Output.object({ schema: z.object({ canonical: z.string() }) }),
  });
  return output.canonical.trim().toLowerCase();
}
