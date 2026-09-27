// Recognises ingredient-first questions in the search box and the Telegram bot:
//   "I have a lot of leeks"      -> abundance: recipes that use the most leek
//   "I don't have buttermilk"    -> substitute: what to use instead
// English phrasing only; /lots and /swap work in any language.

export type IngredientIntent = { kind: "abundance" | "substitute"; ingredient: string };

const ABUNDANCE = [
  /\b(?:a lot of|lots of|loads of|tons of|plenty of|too much|too many|a glut of|excess|surplus|leftover|left-over|left over)\s+(.+)$/i,
  /\b(?:need to |have to |want to )?use up(?: (?:my|the|some|all|all the))?\s+(.+)$/i,
  /^\/lots(?:@\w+)?\s+(.+)$/i,
];

const SUBSTITUTE = [
  /\b(?:instead of|substitute(?: for)?|replacement for|alternative to|swap(?: for)?|replace)\s+(.+)$/i,
  /\b(?:ran out of|run out of|out of|don'?t have(?: any)?|do not have(?: any)?|have no|no more)\s+(.+)$/i,
  /^(?:no|without)\s+(.+)$/i,
  /^\/swap(?:@\w+)?\s+(.+)$/i,
];

export function parseIngredientIntent(query: string): IngredientIntent | null {
  const q = query.trim().replace(/[?.!]+$/, "");
  for (const re of SUBSTITUTE) {
    const m = q.match(re);
    if (m) return clean("substitute", m[1]);
  }
  for (const re of ABUNDANCE) {
    const m = q.match(re);
    if (m) return clean("abundance", m[1]);
  }
  return null;
}

function clean(kind: IngredientIntent["kind"], raw: string): IngredientIntent | null {
  const ingredient = raw
    .toLowerCase()
    // Trailing context like "…, what can I make" or "… in this cake".
    .replace(/\s*(?:,|;|\bwhat\b|\bwhich\b|\bany\b ideas?|\bin (?:the|my|this|a)\b|\bfor (?:the|my|this|a)\b).*$/, "")
    .replace(/^(?:some|any|the|my|all the|all)\s+/, "")
    .trim();
  return ingredient ? { kind, ingredient } : null;
}

const INVARIANT = new Set(["molasses", "couscous", "greens", "grits", "oats", "swiss", "series"]);

/** Naive English singular, good enough for canonical ingredient names. */
export function singular(word: string): string {
  return word
    .split(" ")
    .map((w, i, all) => {
      if (i !== all.length - 1 || INVARIANT.has(w) || /(?:us|is|ss)$/.test(w)) return w;
      if (w.endsWith("ies")) return w.slice(0, -3) + "y";
      if (w.endsWith("oes") || w.endsWith("ches") || w.endsWith("shes")) return w.slice(0, -2);
      if (w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
      return w;
    })
    .join(" ");
}
