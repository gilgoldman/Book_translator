// Amounts as a cook reads them: "4.2 cups" becomes "4 ¼ cups", and for a Hebrew reader the
// English unit words imports used to write ("1 ½ cups") become Hebrew ("1 ½ כוסות"). New imports
// write amounts in the recipe's language; this keeps older ones readable too.

const FRACTIONS: [number, string][] = [
  [0, ""],
  [1 / 4, "¼"],
  [1 / 3, "⅓"],
  [1 / 2, "½"],
  [2 / 3, "⅔"],
  [3 / 4, "¾"],
  [1, ""],
];

const VOLUME = String.raw`cups?|tablespoons?|tbsps?|tbs|teaspoons?|tsps?|כוס(?:ות)?|כפות|כפיות|כפית|כף`;

/** 4.2 -> "4 ¼", 0.5 -> "½", 3.0 -> "3": the nearest amount a measuring cup or spoon has. */
export function measurable(value: number): string {
  let whole = Math.floor(value);
  const rest = value - whole;
  const [frac, glyph] = FRACTIONS.reduce((best, f) => (Math.abs(f[0] - rest) < Math.abs(best[0] - rest) ? f : best));
  if (frac === 1) whole += 1;
  if (!glyph) return String(whole);
  return whole ? `${whole} ${glyph}` : glyph;
}

// English unit -> Hebrew [one, many].
const HEBREW_UNITS: [RegExp, string, string][] = [
  [/^cups?$/i, "כוס", "כוסות"],
  [/^(?:tablespoons?|tbsps?|tbs)$/i, "כף", "כפות"],
  [/^(?:teaspoons?|tsps?)$/i, "כפית", "כפיות"],
  [/^(?:g|gr|grams?)$/i, "גרם", "גרם"],
  [/^(?:kg|kilograms?)$/i, "ק״ג", "ק״ג"],
  [/^(?:ml|millilit(?:er|re)s?)$/i, "מ״ל", "מ״ל"],
  [/^(?:l|lit(?:er|re)s?)$/i, "ליטר", "ליטר"],
  [/^(?:pinch(?:es)?)$/i, "קמצוץ", "קמצוצים"],
  [/^(?:oz|ounces?)$/i, "אונקיה", "אונקיות"],
  [/^(?:lbs?|pounds?)$/i, "ליברה", "ליברות"],
];
const UNIT_WORDS = String.raw`cups?|tablespoons?|tbsps?|tbs|teaspoons?|tsps?|g|gr|grams?|kg|kilograms?|ml|millilit(?:er|re)s?|l|lit(?:er|re)s?|pinch(?:es)?|oz|ounces?|lbs?|pounds?`;
const QUANTITY = String.raw`\d+(?:[.,]\d+)?(?:\s*[¼⅓½⅔¾⅛])?|[¼⅓½⅔¾⅛]`;
const GLYPH_VALUE: Record<string, number> = { "¼": 0.25, "⅓": 1 / 3, "½": 0.5, "⅔": 2 / 3, "¾": 0.75, "⅛": 0.125 };

function valueOf(quantity: string) {
  const glyph = quantity.match(/[¼⅓½⅔¾⅛]/)?.[0];
  const number = quantity.replace(/[¼⅓½⅔¾⅛]/, "").trim().replace(",", ".");
  return (number ? Number(number) : 0) + (glyph ? GLYPH_VALUE[glyph] : 0);
}

/** An amount ready to show in a recipe shown in `language` ("he", "en"…). */
export function localAmount(text: string, language: string): string {
  let out = text.replace(new RegExp(String.raw`(\d+[.,]\d+)(\s*)(${VOLUME})(?![\p{L}])`, "giu"), (_, n: string, space: string, unit: string) =>
    `${measurable(Number(n.replace(",", ".")))}${space}${unit}`,
  );
  if (language === "he") {
    out = out.replace(new RegExp(String.raw`(${QUANTITY})(\s*)(${UNIT_WORDS})(?![\p{L}])`, "giu"), (_, q: string, _space: string, unit: string) => {
      const match = HEBREW_UNITS.find(([re]) => re.test(unit));
      if (!match) return `${q} ${unit}`;
      return `${q} ${valueOf(q) > 1 ? match[2] : match[1]}`;
    });
  }
  return out;
}

// ---------- scaling ("half the recipe", "×2.5") ----------

// A quantity to scale: "1 ½", "1/2", "1 1/2", "0.5", "3". Slash fractions come first so
// "1/2" is one amount, not two.
const SCALABLE = String.raw`(?:\d+\s+)?\d+\/\d+|${QUANTITY}`;
// Weighed or poured amounts read best as plain numbers ("66 g"), not fractions ("65 ⅔ g").
const DECIMAL_UNITS = String.raw`g|gr|grams?|kg|kilograms?|ml|millilit(?:er|re)s?|l|lit(?:er|re)s?|oz|ounces?|lbs?|pounds?|גרם|ק״ג|קג|מ״ל|מל|ליטר`;

/** "1 ½", "3/4", "1 1/2", "0,3", "½" -> a number (NaN if it isn't one). */
export function parseQuantity(text: string): number {
  const q = text.trim().replace(/^[x×*]\s*|\s*[x×*]$/gi, "");
  const slash = q.match(/^(?:(\d+)\s+)?(\d+)\/(\d+)$/);
  if (slash) return Number(slash[1] ?? 0) + Number(slash[2]) / Number(slash[3]);
  if (!new RegExp(String.raw`^(?:${QUANTITY})$`, "u").test(q)) return NaN;
  return valueOf(q);
}

function decimal(value: number): string {
  if (value >= 10) return String(Math.round(value));
  return String(Number(value.toFixed(1)) || Number(value.toPrecision(1)));
}

/** Every amount in `text` times `factor`: "1 ½ cups" ×2 -> "3 cups", "220 g" ×0.3 -> "66 g". */
export function scaleAmount(text: string, factor: number): string {
  if (factor === 1 || !text) return text;
  const re = new RegExp(String.raw`(${SCALABLE})(?=(\s*(?:${DECIMAL_UNITS})(?![\p{L}]))?)`, "giu");
  return text.replace(re, (q: string, _: string, metricUnit: string | undefined) => {
    const value = parseQuantity(q) * factor;
    if (!Number.isFinite(value)) return q;
    // Tiny amounts (a pinch scaled down) stay visible instead of rounding to "0".
    return metricUnit || value < 0.2 ? decimal(value) : measurable(value);
  });
}
