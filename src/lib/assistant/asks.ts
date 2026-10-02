import { CUISINES } from "@/lib/recipe-types";
import { MESSAGES } from "@/lib/i18n/messages";
import type { MessageKey } from "@/lib/i18n/translate";
import { PERSONA } from "./persona";

// Questions about the book as a whole, in English and Hebrew:
//   "show me all recipes from Dana", "Dana's recipes", "המתכונים של דנה"   -> a person's recipes
//   "let's build an Italian dinner menu", "lunch menu with eggplant"       -> a menu, one dish per course
// Pure parsing; index.ts looks things up.

export type Meal = keyof typeof PERSONA.menus;

export type PersonAsk = { kind: "person"; who: string };
export type MenuAsk = { kind: "menu"; meal: Meal; wants: string; cuisines: string[]; rest: string };

const BY_PERSON = [
  /\b(?:recipes?|dishes|stuff|things)\s+(?:(?:that\s+)?(?:were\s+)?(?:added|uploaded|shared|saved|posted)\s+)?(?:from|by|of)\s+(.+)$/i,
  /\bwhat\s+(?:did|has)\s+(.+?)\s+(?:add|added|upload|uploaded|share|shared|save|saved|post|posted)\b/i,
  /(?:^|\s)@?([\p{L}\p{N}_.-]+)['’]s\s+(?:recipes?|dishes)\b/iu,
  // מתכונים של דנה · המתכונים מאת דנה · מנות של סבתא
  /(?:^|\s)(?:ה?מתכונים|ה?מנות)\s+(?:של|מאת|מ-)\s*(.+)$/,
  // המתכונים שדנה העלתה · מה דנה הוסיפה
  /(?:^|\s)(?:ה?מתכונים|ה?מנות)\s+ש-?(\S+)\s+(?:העל|הוסיפ|הוסיף|שית|שמר)/,
  /^מה\s+(.+?)\s+(?:העלה|העלתה|העלו|הוסיף|הוסיפה|הוסיפו|שיתף|שיתפה|שמר|שמרה)(?:\s|$)/,
];

/** "show me all recipes from user dana" -> dana; null when it isn't about a person. */
export function parsePersonAsk(query: string): PersonAsk | null {
  const q = query.trim().replace(/[?.!]+$/, "");
  for (const re of BY_PERSON) {
    const m = q.match(re);
    if (!m) continue;
    const who = m[1]
      .replace(/^(?:the\s+)?(?:user|member|cook)\s+|^(?:ה)?(?:משתמש|משתמשת)\s+/i, "")
      .replace(/^@/, "")
      .replace(/\s+(?:please|pls|בבקשה)$/i, "")
      .trim();
    // "recipes from Dana" is a person; "recipes from the Italian kitchen with leeks and tomatoes" isn't.
    if (who && who.split(/\s+/).length <= 3) return { kind: "person", who };
  }
  return null;
}

// "Menu" alone is enough; a meal needs a planning word ("what can I make for dinner" is a search).
const MENU = /\bmenus?\b|תפריט/i;
const PLAN = /\b(?:plan|build|compile|put together|host|throw|organi[sz]e|design|create)\b|(?:^|\s)(?:לבנות|להרכיב|לתכנן|לארגן|נבנה|נרכיב|נתכנן|תבנה|תרכיב|תתכנן|בנה|הרכב|תכנן)(?:\s|$)/i;
const MEALS: [Meal, RegExp][] = [
  ["brunch", /\b(?:brunch|breakfast)\b|בראנץ|ארוחת\s+בוקר/i],
  ["lunch", /\blunch(?:eon)?\b|צהריים|צהרים/i],
  ["dinner", /\b(?:dinner|supper|feast|meal)\b|ארוחת\s+ערב|ארוחה|ארוחת|סעודה/i],
];

// Words about the menu itself, not what should be in it.
const FILLER = new Set(
  (
    "i i'd id we we'd let's lets let us me my our a an the to for of from with in on and or some please pls want wanna " +
    "would like love need want to can could you help build compile plan put together host throw organise organize " +
    "design create make making cook cooking menu menus meal meals lunch luncheon dinner supper brunch breakfast feast " +
    "party course courses cuisine cuisines food foods kitchen style styled inspired themed theme dishes dish recipes " +
    "recipe something using based around featuring full whole nice good tonight today tomorrow weekend friday saturday " +
    "אני אנחנו רוצה רוצים בוא בואו בואי נבנה נרכיב נתכנן לבנות להרכיב לתכנן לארגן תבנה תרכיב תתכנן בנה הרכב תכנן " +
    "לי לנו את של עם על מ מן או ו גם בבקשה תפריט תפריטים ארוחה ארוחת ארוחות ערב צהריים צהרים בוקר בראנץ סעודה " +
    "מטבח המטבח אוכל מנה מנות מתכונים מתכון בסגנון סגנון ברוח בהשראת הערב היום מחר שישי שבת"
  ).split(" "),
);

// Hebrew glues "and/the/from/in/to" onto words: "מהמטבח", "האיטלקי".
const unprefixed = (w: string) => (/^[֐-׿]{4,}$/.test(w) ? w.replace(/^[והבלמשכ]{1,2}(?=[֐-׿]{3})/, "") : w);

// Regions and countries that stand for one or more cuisines.
const PLACES: Record<string, string[]> = {
  mediterranean: ["italian", "french", "spanish", "greek", "levantine", "north-african", "middle-eastern"],
  "ים תיכוני": ["italian", "french", "spanish", "greek", "levantine", "north-african", "middle-eastern"],
  "ים תיכונית": ["italian", "french", "spanish", "greek", "levantine", "north-african", "middle-eastern"],
  asian: ["chinese", "japanese", "korean", "thai", "vietnamese", "indian"],
  asia: ["chinese", "japanese", "korean", "thai", "vietnamese", "indian"],
  אסייתי: ["chinese", "japanese", "korean", "thai", "vietnamese", "indian"],
  אסיה: ["chinese", "japanese", "korean", "thai", "vietnamese", "indian"],
  european: ["italian", "french", "spanish", "greek", "british", "nordic", "central-european", "eastern-european"],
  europe: ["italian", "french", "spanish", "greek", "british", "nordic", "central-european", "eastern-european"],
  אירופאי: ["italian", "french", "spanish", "greek", "british", "nordic", "central-european", "eastern-european"],
  אירופה: ["italian", "french", "spanish", "greek", "british", "nordic", "central-european", "eastern-european"],
  "middle east": ["middle-eastern", "levantine", "persian"],
  "מזרח תיכון": ["middle-eastern", "levantine", "persian"],
  italy: ["italian"], איטליה: ["italian"],
  france: ["french"], צרפת: ["french"],
  spain: ["spanish"], ספרד: ["spanish"],
  greece: ["greek"], יוון: ["greek"],
  lebanon: ["levantine"], lebanese: ["levantine"], syria: ["levantine"], syrian: ["levantine"], לבנון: ["levantine"], לבנוני: ["levantine"],
  israel: ["middle-eastern", "levantine"], israeli: ["middle-eastern", "levantine"], ישראל: ["middle-eastern", "levantine"], ישראלי: ["middle-eastern", "levantine"],
  morocco: ["north-african"], moroccan: ["north-african"], tunisian: ["north-african"], מרוקו: ["north-african"], מרוקאי: ["north-african"], תוניסאי: ["north-african"],
  iran: ["persian"], iranian: ["persian"], איראן: ["persian"], איראני: ["persian"],
  india: ["indian"], הודו: ["indian"],
  china: ["chinese"], סין: ["chinese"],
  japan: ["japanese"], יפן: ["japanese"],
  korea: ["korean"], קוריאה: ["korean"],
  thailand: ["thai"], תאילנד: ["thai"],
  vietnam: ["vietnamese"], וייטנאם: ["vietnamese"],
  mexico: ["mexican"], מקסיקו: ["mexican"],
  scandinavian: ["nordic"], סקנדינבי: ["nordic"],
};

/** Every name a cuisine goes by: its id, and its label in each app language. */
const CUISINE_NAMES: [string, string][] = CUISINES.filter((c) => c !== "other").flatMap((c) => [
  [c.replace(/-/g, " "), c] as [string, string],
  ...Object.values(MESSAGES).map((m) => [String(m[`cuisine.${c}` as MessageKey]).toLowerCase().replace(/-/g, " "), c] as [string, string]),
]);
const NAMES: [string, string[]][] = [
  ...Object.entries(PLACES),
  ...CUISINE_NAMES.map(([name, c]) => [name, [c]] as [string, string[]]),
].sort((a, b) => b[0].split(" ").length - a[0].split(" ").length);

/**
 * The cuisines a few words name ("Italian", "איטלקית", "Mediterranean"), and the words left
 * over ("with eggplant" -> "eggplant"). Hebrew adjectives bend ("איטלקית"), so a word starting
 * with a cuisine's name counts.
 */
export function cuisinesIn(text: string): { cuisines: string[]; rest: string[] } {
  let words = (text.toLowerCase().match(/[\p{L}\p{N}'’-]+/gu) ?? []).map((w) => w.replace(/-/g, " ")).join(" ").split(" ");
  const found = new Set<string>();
  for (const [name, cuisines] of NAMES) {
    const parts = name.split(" ");
    for (let i = 0; i + parts.length <= words.length; i++) {
      const hit = parts.every((p, k) => {
        const w = words[i + k];
        const hebrew = /^[֐-׿]/.test(p);
        return w === p || (hebrew && (w.startsWith(p) || unprefixed(w).startsWith(p))) || (!hebrew && w === `${p}s`);
      });
      if (!hit) continue;
      cuisines.forEach((c) => found.add(c));
      words = [...words.slice(0, i), ...words.slice(i + parts.length)];
      i--;
    }
  }
  return { cuisines: [...found], rest: words };
}

/** "let's build an Italian dinner menu with eggplant" -> dinner, Italian, eggplant. */
export function parseMenuAsk(query: string): MenuAsk | null {
  const q = query.trim().replace(/[?.!]+$/, "");
  const meal = MEALS.find(([, re]) => re.test(q))?.[0];
  if (!MENU.test(q) && !(meal && PLAN.test(q))) return null;
  const { cuisines, rest } = cuisinesIn(q);
  const left = rest.filter((w) => w && !FILLER.has(w) && !FILLER.has(unprefixed(w)) && !/^\d+$/.test(w));
  const wants = (q.toLowerCase().match(/[\p{L}\p{N}'’-]+/gu) ?? [])
    .filter((w) => !FILLER.has(w) && !FILLER.has(unprefixed(w)))
    .join(" ");
  return { kind: "menu", meal: meal ?? "dinner", wants, cuisines, rest: left.join(" ") };
}

export type MenuDish = { id: string; title: string; course: string };

/**
 * One dish per course of the meal, from candidates best first. A course nothing fits is left
 * out rather than filled with something off-theme.
 */
export function planMenu<T extends MenuDish>(meal: Meal, candidates: T[]): T[] {
  const used = new Set<string>();
  const picked: T[] = [];
  for (const courses of PERSONA.menus[meal]) {
    const dish = candidates.find((c) => !used.has(c.id) && (courses as readonly string[]).includes(c.course));
    if (!dish) continue;
    used.add(dish.id);
    picked.push(dish);
  }
  return picked;
}
