// Recognises ingredient-first questions in the search box and the chat bot:
//   "I have a lot of leeks"                        -> abundance: recipes that use the most leek
//   "I don't have buttermilk"                      -> substitute: what to use instead
//   "No buttermilk, would yogurt work?"            -> substitute, asking about a candidate
// English and Hebrew phrasing; /lots and /swap work in any language.

export type IngredientIntent =
  | { kind: "abundance"; ingredient: string }
  | { kind: "substitute"; ingredient: string; candidate?: string };

const ABUNDANCE = [
  /\b(?:a lot of|lots of|loads of|tons of|plenty of|too much|too many|a glut of|excess|surplus|leftover|left-over|left over)\s+(.+)$/i,
  /\b(?:need to |have to |want to )?use up(?: (?:my|the|some|all|all the))?\s+(.+)$/i,
  /^\/lots(?:@\w+)?\s+(.+)$/i,
  // יש לי הרבה כרישות · המון עגבניות · נשארו לי שאריות של אורז · צריך לגמור את הקישואים
  /(?:^|\s)(?:הרבה|המון|מלא|יותר מדי|עודף(?: של)?|שאריות(?: של)?|נשאר(?:ו|ה)? לי(?: הרבה)?)\s+(.+)$/,
  /(?:^|\s)(?:לגמור|לנצל|לסיים|לגמר)(?: את)?\s+(.+)$/,
];

const SUBSTITUTE = [
  /\b(?:instead of|substitute(?: for)?|replacement for|alternative to|swap(?: for)?|replace)\s+(.+)$/i,
  /\b(?:ran out of|run out of|out of|don'?t have(?: any)?|do not have(?: any)?|have no|no more)\s+(.+)$/i,
  /^(?:no|without)\s+(.+)$/i,
  /^\/swap(?:@\w+)?\s+(.+)$/i,
  // אין לי רוויון · נגמר לי החלב · במקום חמאה · תחליף לביצים · בלי גלוטן
  /(?:^|\s)(?:במקום|תחליף(?: של| ל-?|\s)|להחליף(?: את)?|חלופה ל-?)\s*(.+)$/,
  /(?:^|\s)(?:אין לי|אין|נגמר(?:ו|ה)?(?: לי)?|חסר(?:ים|ה)? לי|בלי|ללא)\s+(.+)$/,
];

// "Can I use yogurt instead of buttermilk" names both at once. `use` is the group holding the
// candidate, the other one holds what's missing.
const USE_INSTEAD: { re: RegExp; use: 1 | 2 }[] = [
  { re: /\b(?:can|could|may|should)\s+i\s+(?:use|try|put(?: in)?|go with)\s+(.+?)\s+(?:instead of|in place of|rather than)\s+(.+)$/i, use: 1 },
  { re: /\b(?:would|will|does|do|is)\s+(.+?)\s+(?:work|do|be (?:ok|okay|fine))\s+(?:instead of|in place of|for)\s+(.+)$/i, use: 1 },
  // "substitute margarine for butter" means margarine goes in.
  { re: /\bsubstitute\s+(.+?)\s+for\s+(.+)$/i, use: 1 },
  { re: /\b(?:replace|swap(?: out)?|substitute)\s+(.+?)\s+(?:with|for|by)\s+(.+)$/i, use: 2 },
  // אפשר יוגורט במקום חמאה · אפשר להשתמש ביוגורט במקום חלב
  { re: /(?:^|\s)אפשר\s+(?:לשים\s+|לקחת\s+|להשתמש\s+ב-?|לנסות\s+)?(.+?)\s+במקום\s+(.+)$/, use: 1 },
  // אפשר להחליף חמאה בשמן
  { re: /(?:^|\s)(?:אפשר\s+)?להחליף\s+(?:את\s+)?(.+?)\s+ב-?(\S.*)$/, use: 2 },
  // במקום חמאה אפשר שמן
  { re: /(?:^|\s)במקום\s+(.+?)\s+אפשר\s+(?:לשים\s+|להשתמש\s+ב-?)?(.+)$/, use: 2 },
];

// After "I don't have X": "would yogurt work", "can I use yogurt", "אפשר יוגורט".
const ASKS_ABOUT = /^(?:or\s+|maybe\s+)?(?:would|will|could|can|does|do|is|what about|how about)\s|^(?:אולי\s+|ו?אם\s+)?(?:אפשר|יעבוד|זה יעבוד|מה עם|מה לגבי)(?:\s|$)/i;
// Where the missing part ends and the question about a candidate starts.
const THEN_ASKS = /^(.+?)(?:\s*[,;:—–]\s*|\s+-\s+|\.\s+|\s+but\s+|\s+(?=(?:would|will|could|can|what about|how about|אפשר|אולי|מה עם|מה לגבי|יעבוד)\s))(.+)$/i;

export function parseIngredientIntent(query: string): IngredientIntent | null {
  const q = query.trim().replace(/[?.!]+$/, "");
  for (const { re, use } of USE_INSTEAD) {
    const m = q.match(re);
    if (!m) continue;
    const missing = clean("substitute", m[use === 1 ? 2 : 1]);
    const candidate = cleanCandidate(m[use]);
    if (missing && candidate) return { ...missing, kind: "substitute", candidate };
  }
  const asks = q.match(THEN_ASKS);
  if (asks && ASKS_ABOUT.test(asks[2])) {
    const missing = parseIngredientIntent(asks[1]);
    const candidate = cleanCandidate(asks[2]);
    if (missing?.kind === "substitute" && candidate) return { ...missing, candidate };
  }
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
    // Hebrew trailing context: "…, מה אפשר להכין" / "… בעוגה".
    .replace(/\s*(?:[,;]|(?:^|\s)(?:מה|איזה|אילו|במתכון|בעוגה|בשביל)(?=\s|$)).*$/, "")
    .replace(/^(?:את|של)\s+/, "")
    // Trailing context like "…, what can I make" or "… in this cake".
    .replace(/\s*(?:,|;|\bwhat\b|\bwhich\b|\bany\b ideas?|\bin (?:the|my|this|a)\b|\bfor (?:the|my|this|a)\b).*$/, "")
    .replace(/^(?:some|any|the|my|all the|all)\s+/, "")
    // "what can I replace butter with"
    .replace(/\s+with$/, "")
    .trim();
  return ingredient ? { kind, ingredient } : null;
}

/** "would Greek yogurt work instead" -> "greek yogurt"; null when it names nothing ("can I use something else"). */
function cleanCandidate(raw: string): string | null {
  const said = raw
    .toLowerCase()
    .replace(/[?.!]+$/, "")
    .replace(ASKS_ABOUT, "")
    .replace(/^(?:i\s+)?(?:use|try|put(?: in)?|go with|substitute|sub|swap in)\s+/, "")
    .replace(/^(?:לשים|לקחת|לנסות)\s+|^(?:להשתמש|להחליף)\s+ב-?/, "")
    .replace(/^(?:some|a|an|the|my)\s+/, "")
    .replace(/^(?:את|עם)\s+/, "")
    .replace(/\s+(?:work|do|be (?:ok|okay|fine|good)|be a good (?:sub|substitute|swap|replacement))(?=\s|$).*$/, "")
    .replace(/\s+(?:instead|in its place|for (?:it|that|this)|there|here)$/, "")
    .replace(/\s+(?:במקום(?:\s.*)?|במקומ(?:ו|ה|ם|ן)|יעבוד|זה יעבוד|יהיה בסדר|טוב)$/, "")
    .trim();
  if (!said || /^(?:something|anything|what|which|else|it|that|this|משהו|מה|זה)(?:\s|$)/.test(said)) return null;
  return said;
}

/**
 * The line in a recipe that a question is about: by the resolved canonical name, else by the
 * words they used. -1 when the recipe doesn't use it.
 */
export function findIngredientLine(
  ingredients: { name: string; canonical: string }[],
  canonical: string,
  said: string,
): number {
  const exact = ingredients.findIndex((i) => i.canonical.toLowerCase() === canonical.toLowerCase());
  if (exact >= 0) return exact;
  const words = said.toLowerCase().trim();
  if (!words) return -1;
  return ingredients.findIndex((i) => {
    const name = i.name.toLowerCase();
    return name.includes(words) || i.canonical.toLowerCase().includes(singular(words));
  });
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
