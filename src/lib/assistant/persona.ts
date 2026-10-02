import type { Locale } from "@/lib/i18n/config";

// ─────────────────────────────────────────────────────────────────────────────────────────
// THE ASSISTANT'S PERSONALITY, IN ONE PLACE
//
// How it behaves (PERSONA) and everything it says, in every app language (WORDS), on every
// channel it talks on (Telegram today). Edit here and deploy.
//
// Words are rich text in a small HTML subset (<b>, <i>, <code>); each channel turns that into
// its own format. {name}-style placeholders are filled in by the code, and every language must
// use the same ones (a test checks). "a|b|c" means one of a, b or c, picked per message. The
// assistant also borrows a few of the app's words (err.*, dup.*, categories, times) from
// src/lib/i18n/messages.
//
// Under the hood: what it does is in index.ts, how its replies look in render.ts. What only
// one channel has (Telegram's / menu, profile and sign-in) lives with that channel, e.g.
// src/lib/channels/telegram/settings.ts.
// ─────────────────────────────────────────────────────────────────────────────────────────

export const PERSONA = {
  /**
   * Answer in the language each message is written in (Hebrew or English letters). Off:
   * always the person's app language (else the language their chat app is set to).
   */
  followWrittenLanguage: true,

  /**
   * Reactions on the person's message, instead of more words. Telegram allows only its own
   * set: https://core.telegram.org/bots/api#reactiontypeemoji
   */
  reactions: { reading: "👀", saved: "🔥", answered: "👌", notRecipe: "🤔", failed: "😢" },

  /** How many recipes a search lists; how many a "lots of…" answer lists, and pairings with it. */
  searchResults: 6,
  lotsResults: 8,
  pairings: 8,
  /** How many of one person's recipes "recipes from Dana" lists; the rest are a link away. */
  personResults: 12,

  /** "Another menu" buttons go round this many times before starting over. */
  menuRounds: 20,

  /**
   * "Let's build a dinner menu": one dish per course, in this order. Each course takes the
   * first fitting recipe of these kinds; a course nothing fits is left out.
   */
  menus: {
    lunch: [["salad", "soup", "starter"], ["main"], ["side", "bread"]],
    dinner: [["starter", "soup", "salad"], ["main"], ["side"], ["dessert"]],
    brunch: [["breakfast"], ["baking", "bread"], ["salad", "starter"], ["drink"]],
  },

  /** "No buttermilk?" answers per person per hour (each one asks the AI). */
  swapsPerHour: 30,

  /** Corrections ("it's 180°, not 200") per person per hour, and how long a proposed one can be applied. */
  fixesPerHour: 20,
  fixValidHours: 24,

  /**
   * "No buttermilk?" is about the recipe they reply to, else the one the assistant last showed
   * them if it was this recent and uses it. Otherwise it gets a general answer.
   */
  recipeMemoryMinutes: 120,

  /** When Google's AI is busy, retry an import after these waits; give up after this long. */
  busyRetryWaitsMs: [20_000, 40_000],
  busyGiveUpMs: 120_000,

  look: {
    /** Before a recipe's title. */
    course: {
      breakfast: "🍳", starter: "🥟", soup: "🍲", salad: "🥗", main: "🍽", side: "🥔", dessert: "🍰",
      baking: "🥧", bread: "🍞", drink: "🍹", sauce: "🥣", snack: "🥨", preserve: "🫙", other: "🍴",
    } as Record<string, string>,
    /** Before the season, under the title. */
    season: { spring: "🌸", summer: "☀️", autumn: "🍂", winter: "❄️", "all-year": "🗓" } as Record<string, string>,
    /** The ratio view's bars, one colour per component, in order. */
    ratioBars: ["🟨", "🟧", "🟥", "🟩", "🟦", "🟪"],
  },
} as const;

const en = {
  // Shown on /start and /help, and after signing in.
  "bot.help":
    "👋 <b>Send me a recipe</b>, any way you like:\n📸 photos or screenshots (an album = one recipe)\n🔗 a link · 🎙 a voice note · 📝 pasted text\n\n<b>Or ask me</b>, in writing or out loud 🎙\n🔎 <i>leeks, eggs, feta</i> · <i>that lemony chicken</i>\n🧺 <i>I have a lot of leeks</i> or /lots leeks\n🔄 <i>no buttermilk, would yogurt work?</i> or /swap buttermilk\n🧑‍🍳 <i>Dana's recipes</i> · 🍽 <i>build an Italian dinner menu</i>\n✏️ <i>it's 180°, not 200</i> or /fix to correct a recipe you added\n(right after a recipe, or as a reply to one, it's about that recipe)\n\n/find searches · /add imports text as is",
  // For a sticker, a PDF, anything it can't read.
  "bot.nudge": "🙂 Send me a photo, link, voice note or recipe text, or ask me something.",

  // Importing
  "bot.reading": "👩‍🍳 Reading it…|🍳 On it…|📖 Filing it in the book…",
  "bot.busyRetrying": "🤖💤 Google's AI is swamped. I'll keep trying for two minutes.",
  "bot.stillBusy": "🤖💤 Still swamped. Send it again in a bit?",
  "bot.failed": "😕 Couldn't read that. Try again?",
  "bot.dupLooks": "👀 Looks like {title}, already in the book.",
  "bot.dupNew": "🆕 New: {title}",
  "bot.dupNewHas": "➕ New has: {list}",
  "bot.dupOriginalHas": "➖ Original has: {list}",
  "bot.dupWhat": "What should I do?",

  // Answers
  // A voice note taken as a question: what we understood, and a way out if it was a recipe.
  "bot.heard": "🎙 I heard: <i>{query}</i>",
  "bot.saveVoice": "📖 It's a recipe, save it",
  "bot.nothingFor": "🤷 Nothing for “{query}” yet.",
  "bot.needsMore": "🛒 needs {n} more",
  "bot.haveAll": "✅ you have it all",
  "bot.noSwap": "🔄 No {name}? Try:",
  "bot.noSwapIn": "🔄 No {name} for {title}? Try:",
  // "Would yogurt work?": the question, the verdict, then the other ideas.
  "bot.asked": "🔄 {use} instead of {name}?",
  "bot.askedIn": "🔄 {use} instead of {name} in {title}?",
  "bot.askedYes": "✅ Yes, it works",
  "bot.askedChanges": "⚠️ Works, with changes",
  "bot.askedNo": "❌ Not really",
  "bot.swapOthers": "Other options:",
  "bot.lots": "🧺 Lots of {name}? These use the most:",
  "bot.pairs": "💞 Goes well with: {list}",
  // "Dana's recipes": who, how many, then the newest few.
  "bot.byPerson": "🧑‍🍳 {name} added {n}:",
  "bot.byPersonMore": "…and {n} more in the cookbook.",
  "bot.byPersonNone": "🤷 {name} hasn't added any recipes yet.",
  // "Let's build an Italian dinner menu"
  "bot.menu.lunch": "🥪 A lunch menu",
  "bot.menu.dinner": "🍽 A dinner menu",
  "bot.menu.brunch": "🥐 A brunch menu",
  "bot.menuNone": "🤷 Not enough in the book for a menu with “{query}” yet.",
  "bot.anotherMenu": "🔀 Another menu",
  // Correcting a recipe: what would change, then Apply / Cancel.
  "bot.fixAsk": "✏️ Change {title} like this?",
  "bot.fixApply": "✅ Apply",
  "bot.fixCancel": "✖️ Cancel",
  "bot.fixApplying": "✏️ Saving the change…",
  "bot.fixCancelled": "👍 Left it as it was.",
  "bot.fixGone": "🤷 That change was already applied, cancelled, or is too old. Tell me again?",
  "bot.fixStale": "🔄 The recipe changed since. Tell me the fix again?",
  "bot.fixNothing": "🤔 I couldn't tell what to change. Try “2 eggs, not 3”.",
  "bot.fixNotYours": "🙂 Only whoever added this recipe can change it.",
  "bot.fixWhich": "✏️ Which recipe? Reply to it, or open it first, then tell me the fix.",
  "bot.slowDown": "🫖 Let's take a breather. Try again soon.",
  "bot.couldnt": "😕 Couldn't do that.",
  "bot.gone": "🫥 That recipe is gone.",

  // A recipe
  "bot.makes": "makes {n}",
  "bot.noOriginal": "🤷 No original saved.",
  "bot.openInApp": "📖 Open in the cookbook",
  "bot.view.effective": "🔥 Cook",
  "bot.view.classic": "📜 Classic",
  "bot.view.ratios": "⚖️ Ratios",
  "bot.view.source": "🗂 Original",
};

export type WordKey = keyof typeof en;

const he: Record<WordKey, string> = {
  "bot.help":
    "👋 <b>שלחו לי מתכון</b>, איך שנוח:\n📸 תמונות או צילומי מסך (אלבום = מתכון אחד)\n🔗 קישור · 🎙 הקלטה קולית · 📝 טקסט\n\n<b>או תשאלו אותי</b>, בכתב או בהקלטה 🎙\n🔎 <i>כרישה, ביצים, פטה</i> · <i>העוף הלימוני ההוא</i>\n🧺 <i>יש לי הרבה כרישות</i> או /lots כרישה\n🔄 <i>אין לי רוויון, אפשר יוגורט?</i> או /swap רוויון\n🧑‍🍳 <i>המתכונים של דנה</i> · 🍽 <i>בוא נבנה תפריט לארוחת ערב איטלקית</i>\n✏️ <i>צריך להיות 180 מעלות ולא 200</i> או /fix לתיקון מתכון שהוספת\n(מיד אחרי מתכון, או בתגובה אליו, זה לגבי המתכון הזה)\n\n/find לחיפוש · /add לייבוא טקסט כמו שהוא",
  "bot.nudge": "🙂 שלחו לי תמונה, קישור, הקלטה או טקסט של מתכון, או תשאלו אותי משהו.",

  "bot.reading": "👩‍🍳 קורא…|🍳 על זה…|📖 מתייק בספר…",
  "bot.busyRetrying": "🤖💤 הבינה המלאכותית של Google עמוסה. אמשיך לנסות עוד שתי דקות.",
  "bot.stillBusy": "🤖💤 עדיין עמוסה. שלחו שוב עוד מעט?",
  "bot.failed": "😕 לא הצלחתי לקרוא את זה. לנסות שוב?",
  "bot.dupLooks": "👀 נראה כמו {title}, שכבר בספר.",
  "bot.dupNew": "🆕 החדש: {title}",
  "bot.dupNewHas": "➕ בחדש יש: {list}",
  "bot.dupOriginalHas": "➖ במקורי יש: {list}",
  "bot.dupWhat": "מה לעשות?",

  "bot.heard": "🎙 שמעתי: <i>{query}</i>",
  "bot.saveVoice": "📖 זה מתכון, לשמור אותו",
  "bot.nothingFor": "🤷 עדיין אין כלום עבור „{query}”.",
  "bot.needsMore": "🛒 חסרים עוד {n}",
  "bot.haveAll": "✅ יש לך הכול",
  "bot.noSwap": "🔄 אין {name}? אפשר לנסות:",
  "bot.noSwapIn": "🔄 אין {name} בשביל {title}? אפשר לנסות:",
  "bot.asked": "🔄 {use} במקום {name}?",
  "bot.askedIn": "🔄 {use} במקום {name} ב{title}?",
  "bot.askedYes": "✅ כן, זה עובד",
  "bot.askedChanges": "⚠️ עובד, עם שינויים",
  "bot.askedNo": "❌ לא ממש",
  "bot.swapOthers": "אפשרויות נוספות:",
  "bot.lots": "🧺 הרבה {name}? אלה משתמשים בהכי הרבה:",
  "bot.pairs": "💞 הולך טוב עם: {list}",
  "bot.byPerson": "🧑‍🍳 {name} הוסיפו {n}:",
  "bot.byPersonMore": "…ועוד {n} בספר.",
  "bot.byPersonNone": "🤷 {name} עוד לא הוסיפו מתכונים.",
  "bot.menu.lunch": "🥪 תפריט לארוחת צהריים",
  "bot.menu.dinner": "🍽 תפריט לארוחת ערב",
  "bot.menu.brunch": "🥐 תפריט לבראנץ׳",
  "bot.menuNone": "🤷 עדיין אין בספר מספיק לתפריט עם „{query}”.",
  "bot.anotherMenu": "🔀 תפריט אחר",
  "bot.fixAsk": "✏️ לשנות את {title} ככה?",
  "bot.fixApply": "✅ לשמור",
  "bot.fixCancel": "✖️ ביטול",
  "bot.fixApplying": "✏️ שומר את השינוי…",
  "bot.fixCancelled": "👍 השארתי כמו שהיה.",
  "bot.fixGone": "🤷 השינוי הזה כבר נשמר, בוטל או ישן מדי. לספר לי שוב?",
  "bot.fixStale": "🔄 המתכון השתנה בינתיים. לספר לי שוב מה לתקן?",
  "bot.fixNothing": "🤔 לא הבנתי מה לשנות. אפשר לנסות „2 ביצים ולא 3”.",
  "bot.fixNotYours": "🙂 רק מי שהוסיפו את המתכון יכולים לשנות אותו.",
  "bot.fixWhich": "✏️ איזה מתכון? תגיבו עליו, או תפתחו אותו קודם, ואז תגידו לי מה לתקן.",
  "bot.slowDown": "🫖 בואו ניקח הפסקה קטנה. אפשר לנסות שוב בקרוב.",
  "bot.couldnt": "😕 לא הצלחתי.",
  "bot.gone": "🫥 המתכון הזה כבר לא קיים.",

  "bot.makes": "כמות: {n}",
  "bot.noOriginal": "🤷 המקור לא נשמר.",
  "bot.openInApp": "📖 לפתוח בספר",
  "bot.view.effective": "🔥 בישול",
  "bot.view.classic": "📜 קלאסי",
  "bot.view.ratios": "⚖️ יחסים",
  "bot.view.source": "🗂 מקור",
};

/** Everything the assistant says, per app language. A new app language needs its words here too. */
export const WORDS: Record<Locale, Record<WordKey, string>> = { en, he };
