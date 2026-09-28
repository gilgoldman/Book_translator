// The languages the app speaks. To add one: add it here, add messages/<code>.ts
// (TypeScript lists any missing strings), register it in messages/index.ts, then run
// `npm run translate` so existing recipes get a version in it.

export const LOCALES = {
  en: { name: "English", englishName: "English", dir: "ltr" },
  he: { name: "עברית", englishName: "Hebrew", dir: "rtl" },
} as const;

export type Locale = keyof typeof LOCALES;
export const LOCALE_CODES = Object.keys(LOCALES) as Locale[];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "cookbook_lang";

export const isLocale = (value: unknown): value is Locale =>
  typeof value === "string" && Object.hasOwn(LOCALES, value);

/** Best supported match for an Accept-Language header or a Telegram language_code. */
export function matchLocale(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const wanted = header
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { lang: tag.toLowerCase().split("-")[0], q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  // "iw" is the old code for Hebrew that some Android versions still send.
  for (const { lang } of wanted) {
    const code = lang === "iw" ? "he" : lang;
    if (isLocale(code)) return code;
  }
  return null;
}

/**
 * The app language a message is written in, told by its letters: Hebrew script or Latin.
 * Links, a leading /command and @mentions don't count. Null when there are no letters.
 */
export function detectLocale(text: string | null | undefined): Locale | null {
  const words = (text ?? "").replace(/^\s*\/\w+(?:@\w+)?|https?:\/\/\S+|@\w+/g, " ");
  const hebrew = words.match(/[א-ת]/g)?.length ?? 0;
  const latin = words.match(/[a-z]/gi)?.length ?? 0;
  if (!hebrew && !latin) return null;
  return hebrew >= latin ? "he" : "en";
}

const RTL = new Set(["he", "ar", "fa", "ur", "yi"]);
export const dirFor = (lang: string) => (RTL.has(lang) ? "rtl" : "ltr");

/** "Hebrew", "איטלקית"…: a language's name in the reader's language. */
export function languageName(code: string, inLocale: string): string {
  try {
    return new Intl.DisplayNames([inLocale], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}
