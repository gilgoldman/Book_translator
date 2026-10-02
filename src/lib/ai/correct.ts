import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import { LOCALES, type Locale } from "@/lib/i18n/config";
import type { RecipeText } from "@/lib/recipe-changes";
import { AI_MAX_RETRIES, ai } from "./models";

const SYSTEM = `You fix mistakes in a family cookbook's recipe, as its owner tells you in a chat message.

Rules:
- Change only what the message asks for. Copy every other line exactly, character for character.
- Keep the recipe's language, wording and units. Write a changed line the way the recipe writes the others.
- When a fix affects other lines (a renamed ingredient that steps mention, an amount repeated in a step), fix those too.
- Never invent ingredients, steps, amounts or times the message doesn't give.
- If the message isn't asking to change the recipe (a question, a search, a remark), set isCorrection to false and copy the recipe unchanged.
- "summary" says in one short sentence what you changed, in the reader's language.`;

const schema = z.object({
  isCorrection: z.boolean(),
  summary: z.string(),
  title: z.string(),
  servings: z.string().nullable(),
  prepMinutes: z.number().int().nullable(),
  cookMinutes: z.number().int().nullable(),
  totalMinutes: z.number().int().nullable(),
  ingredients: z.array(z.string()).describe("One line each, as written: quantity, unit, name, notes"),
  steps: z.array(z.string()).describe("One step each"),
});

export type Correction = { isCorrection: boolean; summary: string; recipe: RecipeText };

/** The recipe as it would be after the correction they sent. Nothing is saved. */
export async function proposeCorrection(recipe: RecipeText, message: string, reader: Locale): Promise<Correction> {
  const { output } = await generateText({
    model: ai.languageModel("quick"),
    maxRetries: AI_MAX_RETRIES,
    system: `${SYSTEM}\nThe reader's language: ${LOCALES[reader].englishName}.`,
    prompt: `Recipe:\n${JSON.stringify(recipe, null, 1)}\n\nTheir message:\n${message}`,
    output: Output.object({ schema }),
  });
  const { isCorrection, summary, ...fixed } = output;
  return { isCorrection, summary, recipe: fixed };
}
