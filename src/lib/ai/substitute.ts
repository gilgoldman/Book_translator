import "server-only";
import { generateText, Output } from "ai";
import { eq } from "drizzle-orm";
import { db, substitutions } from "@/db";
import { LOCALES, type Locale } from "@/lib/i18n/config";
import { substitutionSchema, type Substitution } from "@/lib/recipe-types";
import { ai } from "./models";

const SYSTEM = `You are an experienced home cook helping someone who is missing an ingredient.
Suggest 2-3 practical substitutes, best first, favouring things most kitchens have.
Give exact amounts for the stated quantity when one is given. Be honest about how the dish changes.
If the ingredient is the heart of the dish and nothing works, say so in "tip".
Answer briefly. Metric units first.`;

export type SubstituteContext = {
  recipeTitle: string;
  line: string; // the ingredient line, e.g. "250 ml buttermilk"
  usedIn: string[]; // the steps that use it
};

/** Cached per ingredient (general) or per recipe+ingredient (in context), per language. */
export async function suggestSubstitutes(
  ingredient: string,
  locale: Locale,
  context?: SubstituteContext & { recipeId: string },
): Promise<Substitution> {
  // English keeps the old key shape so answers cached before translations still count.
  const key = `${ingredient.toLowerCase()}|${context?.recipeId ?? ""}${locale === "en" ? "" : `|${locale}`}`;
  const cached = await db().query.substitutions.findFirst({ where: eq(substitutions.key, key) });
  if (cached) return cached.result as Substitution;

  const prompt = context
    ? `Recipe: ${context.recipeTitle}\nMissing ingredient: ${context.line}\nUsed in:\n${context.usedIn
        .map((s) => `- ${s}`)
        .join("\n")}`
    : `Missing ingredient: ${ingredient}\nNo specific recipe; give general-purpose substitutes.`;

  const { output } = await generateText({
    model: ai.languageModel("quick"),
    system: `${SYSTEM}\nWrite in ${LOCALES[locale].englishName}.`,
    prompt,
    output: Output.object({ schema: substitutionSchema }),
  });
  await db().insert(substitutions).values({ key, result: output }).onConflictDoNothing();
  return output;
}
