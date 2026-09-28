import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import { AI_MAX_RETRIES, ai } from "./models";

const SYSTEM = `You hear a voice note sent to a family cookbook's chat bot. Decide what the speaker wants.

- "recipe": they are dictating or describing a recipe to save (ingredients, amounts, how to make it).
- "question": they are asking the cookbook something: looking for a recipe, what to cook with what
  they have, what to do with a lot of an ingredient, or what to use instead of a missing one.

If unsure: a short note that asks, or only names a dish or some ingredients, is a question; one that
walks through making something is a recipe.

For a question, write "query" the way they would type it to the bot: short, in the language they spoke.
- Looking for something: the dish, or the ingredients ("chocolate cake", "leeks, eggs, feta", "עוגת שוקולד").
- Has a lot of something: "I have a lot of <ingredient>" / "יש לי הרבה <ingredient>".
- Missing something: "no <ingredient>" / "אין לי <ingredient>".
For a recipe, leave "query" empty.`;

const heardSchema = z.object({
  kind: z.enum(["question", "recipe"]),
  query: z.string(),
});

export type HeardVoiceNote = z.infer<typeof heardSchema>;

/** Is this voice note a question for the cookbook or a recipe to save? One quick listen. */
export async function hearVoiceNote(
  file: { data: Uint8Array; mediaType: string },
  caption?: string,
): Promise<HeardVoiceNote> {
  const { output } = await generateText({
    model: ai.languageModel("quick"),
    maxRetries: AI_MAX_RETRIES,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: caption ? `The sender added this note: ${caption}` : "The voice note:" },
          { type: "file", data: file.data, mediaType: file.mediaType },
        ],
      },
    ],
    output: Output.object({ schema: heardSchema }),
  });
  return { kind: output.kind, query: output.query.trim() };
}
