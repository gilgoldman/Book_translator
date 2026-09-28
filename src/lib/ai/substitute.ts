import "server-only";
import { generateText, Output } from "ai";
import { eq } from "drizzle-orm";
import { db, substitutions } from "@/db";
import { LOCALES, type Locale } from "@/lib/i18n/config";
import { substitutionSchema, type Substitution } from "@/lib/recipe-types";
import { AI_MAX_RETRIES, ai } from "./models";

const SYSTEM = `You are an experienced home cook helping someone who is missing an ingredient.
Suggest 2-3 practical substitutes, best first, favouring things most kitchens have.
If they ask about a specific substitute, judge it first in "asked": yes, with changes, or no, and why.
Give exact amounts for the stated quantity when one is given. Be honest about how the dish changes.
If the ingredient is the heart of the dish and nothing works, say so in "tip".
Answer briefly. Metric units first.`;

export type SubstituteContext = {
  recipeTitle: string;
  line: string; // the ingredient line, e.g. "250 ml buttermilk"
  usedIn: string[]; // the steps that use it
};

/** The recipe context for one of its ingredient lines. */
export function substituteContext(
  recipe: { id: string; titleEnglish: string; ingredients: { name: string; original: string }[]; steps: { text: string }[] },
  index: number,
): SubstituteContext & { recipeId: string } {
  const ing = recipe.ingredients[index];
  const word = ing.name.toLowerCase();
  const last = word.split(" ").pop() ?? word;
  return {
    recipeId: recipe.id,
    recipeTitle: recipe.titleEnglish,
    line: ing.original,
    usedIn: recipe.steps.map((s) => s.text).filter((t) => t.toLowerCase().includes(last)),
  };
}

/**
 * Cached per ingredient (general) or per recipe+ingredient (in context), per language, and per
 * substitute they asked about ("would yogurt work?").
 */
export async function suggestSubstitutes(
  ingredient: string,
  locale: Locale,
  context?: SubstituteContext & { recipeId: string },
  candidate?: string,
): Promise<Substitution> {
  const asked = candidate?.trim().toLowerCase();
  // English keeps the old key shape so answers cached before translations still count.
  const key = `${ingredient.toLowerCase()}|${context?.recipeId ?? ""}${locale === "en" ? "" : `|${locale}`}${asked ? `|with:${asked}` : ""}`;
  const cached = await db().query.substitutions.findFirst({ where: eq(substitutions.key, key) });
  if (cached) return cached.result as Substitution;

  const prompt = [
    context
      ? `Recipe: ${context.recipeTitle}\nMissing ingredient: ${context.line}\nUsed in:\n${context.usedIn
          .map((s) => `- ${s}`)
          .join("\n")}`
      : `Missing ingredient: ${ingredient}\nNo specific recipe; give general-purpose substitutes.`,
    asked ? `They ask: would ${asked} work instead?` : `They didn't ask about a specific substitute; "asked" is null.`,
  ].join("\n");

  const { output } = await generateText({
    model: ai.languageModel("quick"),
    maxRetries: AI_MAX_RETRIES,
    system: `${SYSTEM}\nWrite in ${LOCALES[locale].englishName}.`,
    prompt,
    output: Output.object({ schema: substitutionSchema }),
  });
  const result = asked ? output : { ...output, asked: null };
  await db().insert(substitutions).values({ key, result }).onConflictDoNothing();
  return result;
}
