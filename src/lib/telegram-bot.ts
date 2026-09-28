import type { Locale } from "@/lib/i18n/config";

// ─────────────────────────────────────────────────────────────────────────────────────────
// THE TELEGRAM BOT, IN ONE PLACE
//
// How it behaves (BOT) and everything it says, in every app language (BOT_WORDS).
// Edit here and deploy. Every production deploy also sends the / menu and the profile texts
// ("tg.about", "tg.intro") to Telegram; look for "Telegram bot synced" in the build log.
//
// Words are HTML in Telegram's small subset (<b>, <i>, <code>). {name}-style placeholders are
// filled in by the code, and every language must use the same ones (a test checks). "a|b|c"
// means one of a, b or c, picked per message. The bot also borrows a few of the app's words
// (err.*, dup.*, categories, times) from src/lib/i18n/messages.
//
// Under the hood: replies are drawn in telegram-format.ts, messages are handled in
// src/app/api/telegram/route.ts, and the sync is scripts/telegram-sync.ts.
// ─────────────────────────────────────────────────────────────────────────────────────────

export const BOT = {
  /**
   * Answer in the language each message is written in (Hebrew or English letters). Off:
   * always the person's app language (else their Telegram language).
   */
  followWrittenLanguage: true,

  /** The / menu, in this order. Each needs a "tg.cmd.<name>" line in the words below. */
  commands: ["find", "lots", "swap", "add", "help"],

  /**
   * Reactions on the person's message, instead of more words. Telegram allows only its own
   * set: https://core.telegram.org/bots/api#reactiontypeemoji
   */
  reactions: { reading: "👀", saved: "🔥", answered: "👌", notRecipe: "🤔", failed: "😢" },

  /** How many recipes a search lists; how many a "lots of…" answer lists, and pairings with it. */
  searchResults: 6,
  lotsResults: 8,
  pairings: 8,

  /** "No buttermilk?" answers per person per hour (each one asks the AI). */
  swapsPerHour: 30,

  /**
   * "No buttermilk?" is about the recipe they reply to, else the one the bot last showed them
   * if it was this recent and uses it. Otherwise it gets a general answer.
   */
  recipeMemoryMinutes: 120,

  /** When Google's AI is busy, retry an import after these waits; give up after this long. */
  busyRetryWaitsMs: [20_000, 40_000],
  busyGiveUpMs: 120_000,

  /** How long to wait for the rest of a photo album before reading it as one recipe. */
  albumWaitMs: 2500,

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
  // Shown on /start and /help.
  "tg.help":
    "👋 <b>Send me a recipe</b>, any way you like:\n📸 photos or screenshots (an album = one recipe)\n🔗 a link · 🎙 a voice note · 📝 pasted text\n\n<b>Or ask me</b>, in writing or out loud 🎙\n🔎 <i>leeks, eggs, feta</i> · <i>that lemony chicken</i>\n🧺 <i>I have a lot of leeks</i> or /lots leeks\n🔄 <i>no buttermilk, would yogurt work?</i> or /swap buttermilk\n(right after a recipe, or as a reply to one, it's about that recipe)\n\n/find searches · /add imports text as is",
  // For a sticker, a PDF, anything it can't read.
  "tg.nudge": "🙂 Send me a photo, link, voice note or recipe text, or ask me something.",

  // Signing in
  "tg.private": "👋 Hi! This is a private family cookbook 📖\nConnect with:\n<code>/login username password</code>",
  "tg.connected": "🎉 Hi {name}, you're in!",
  "tg.pending": "⏳ Still waiting for approval.",
  "tg.tooManyLogins": "🛑 Too many tries. Wait 15 minutes, then try again.",

  // Importing
  "tg.reading": "👩‍🍳 Reading it…|🍳 On it…|📖 Filing it in the book…",
  "tg.busyRetrying": "🤖💤 Google's AI is swamped. I'll keep trying for two minutes.",
  "tg.stillBusy": "🤖💤 Still swamped. Send it again in a bit?",
  "tg.failed": "😕 Couldn't read that. Try again?",
  "tg.dupLooks": "👀 Looks like {title}, already in the book.",
  "tg.dupNew": "🆕 New: {title}",
  "tg.dupNewHas": "➕ New has: {list}",
  "tg.dupOriginalHas": "➖ Original has: {list}",
  "tg.dupWhat": "What should I do?",

  // Answers
  // A voice note taken as a question: what we understood, and a way out if it was a recipe.
  "tg.heard": "🎙 I heard: <i>{query}</i>",
  "tg.saveVoice": "📖 It's a recipe, save it",
  "tg.nothingFor": "🤷 Nothing for “{query}” yet.",
  "tg.needsMore": "🛒 needs {n} more",
  "tg.haveAll": "✅ you have it all",
  "tg.noSwap": "🔄 No {name}? Try:",
  "tg.noSwapIn": "🔄 No {name} for {title}? Try:",
  // "Would yogurt work?": the question, the verdict, then the other ideas.
  "tg.asked": "🔄 {use} instead of {name}?",
  "tg.askedIn": "🔄 {use} instead of {name} in {title}?",
  "tg.askedYes": "✅ Yes, it works",
  "tg.askedChanges": "⚠️ Works, with changes",
  "tg.askedNo": "❌ Not really",
  "tg.swapOthers": "Other options:",
  "tg.lots": "🧺 Lots of {name}? These use the most:",
  "tg.pairs": "💞 Goes well with: {list}",
  "tg.slowDown": "🫖 Let's take a breather. Try again soon.",
  "tg.couldnt": "😕 Couldn't do that.",
  "tg.gone": "🫥 That recipe is gone.",

  // A recipe
  "tg.makes": "makes {n}",
  "tg.noOriginal": "🤷 No original saved.",
  "tg.openInApp": "📖 Open in the cookbook",
  "tg.view.effective": "🔥 Cook",
  "tg.view.classic": "📜 Classic",
  "tg.view.ratios": "⚖️ Ratios",
  "tg.view.source": "🗂 Original",

  // The bot's profile (up to 120 and 512 characters) and / menu (up to 256 each).
  "tg.about": "Our family cookbook 📖 Send recipes, ask what to cook.",
  "tg.intro":
    "👋 Send me recipes as photos, links, voice notes or text and I'll file them in the family cookbook. Ask me what to cook with what you have.",
  "tg.cmd.find": "Search the cookbook",
  "tg.cmd.lots": "Recipes that use a lot of something",
  "tg.cmd.swap": "What to use instead",
  "tg.cmd.add": "Import pasted text as a recipe",
  "tg.cmd.help": "What I can do",
};

export type BotKey = keyof typeof en;

const he: Record<BotKey, string> = {
  "tg.help":
    "👋 <b>שלחו לי מתכון</b>, איך שנוח:\n📸 תמונות או צילומי מסך (אלבום = מתכון אחד)\n🔗 קישור · 🎙 הקלטה קולית · 📝 טקסט\n\n<b>או תשאלו אותי</b>, בכתב או בהקלטה 🎙\n🔎 <i>כרישה, ביצים, פטה</i> · <i>העוף הלימוני ההוא</i>\n🧺 <i>יש לי הרבה כרישות</i> או /lots כרישה\n🔄 <i>אין לי רוויון, אפשר יוגורט?</i> או /swap רוויון\n(מיד אחרי מתכון, או בתגובה אליו, זה לגבי המתכון הזה)\n\n/find לחיפוש · /add לייבוא טקסט כמו שהוא",
  "tg.nudge": "🙂 שלחו לי תמונה, קישור, הקלטה או טקסט של מתכון, או תשאלו אותי משהו.",

  "tg.private": "👋 היי! זה ספר מתכונים משפחתי ופרטי 📖\nאפשר להתחבר עם:\n<code>/login username password</code>",
  "tg.connected": "🎉 היי {name}, התחברת!",
  "tg.pending": "⏳ עדיין מחכה לאישור.",
  "tg.tooManyLogins": "🛑 יותר מדי ניסיונות. כדאי לחכות 15 דקות ולנסות שוב.",

  "tg.reading": "👩‍🍳 קורא…|🍳 על זה…|📖 מתייק בספר…",
  "tg.busyRetrying": "🤖💤 הבינה המלאכותית של Google עמוסה. אמשיך לנסות עוד שתי דקות.",
  "tg.stillBusy": "🤖💤 עדיין עמוסה. שלחו שוב עוד מעט?",
  "tg.failed": "😕 לא הצלחתי לקרוא את זה. לנסות שוב?",
  "tg.dupLooks": "👀 נראה כמו {title}, שכבר בספר.",
  "tg.dupNew": "🆕 החדש: {title}",
  "tg.dupNewHas": "➕ בחדש יש: {list}",
  "tg.dupOriginalHas": "➖ במקורי יש: {list}",
  "tg.dupWhat": "מה לעשות?",

  "tg.heard": "🎙 שמעתי: <i>{query}</i>",
  "tg.saveVoice": "📖 זה מתכון, לשמור אותו",
  "tg.nothingFor": "🤷 עדיין אין כלום עבור „{query}”.",
  "tg.needsMore": "🛒 חסרים עוד {n}",
  "tg.haveAll": "✅ יש לך הכול",
  "tg.noSwap": "🔄 אין {name}? אפשר לנסות:",
  "tg.noSwapIn": "🔄 אין {name} בשביל {title}? אפשר לנסות:",
  "tg.asked": "🔄 {use} במקום {name}?",
  "tg.askedIn": "🔄 {use} במקום {name} ב{title}?",
  "tg.askedYes": "✅ כן, זה עובד",
  "tg.askedChanges": "⚠️ עובד, עם שינויים",
  "tg.askedNo": "❌ לא ממש",
  "tg.swapOthers": "אפשרויות נוספות:",
  "tg.lots": "🧺 הרבה {name}? אלה משתמשים בהכי הרבה:",
  "tg.pairs": "💞 הולך טוב עם: {list}",
  "tg.slowDown": "🫖 בואו ניקח הפסקה קטנה. אפשר לנסות שוב בקרוב.",
  "tg.couldnt": "😕 לא הצלחתי.",
  "tg.gone": "🫥 המתכון הזה כבר לא קיים.",

  "tg.makes": "כמות: {n}",
  "tg.noOriginal": "🤷 המקור לא נשמר.",
  "tg.openInApp": "📖 לפתוח בספר",
  "tg.view.effective": "🔥 בישול",
  "tg.view.classic": "📜 קלאסי",
  "tg.view.ratios": "⚖️ יחסים",
  "tg.view.source": "🗂 מקור",

  "tg.about": "ספר המתכונים המשפחתי שלנו 📖 שלחו מתכונים, שאלו מה לבשל.",
  "tg.intro":
    "👋 שלחו לי מתכונים בתמונה, בקישור, בהקלטה או בטקסט ואתייק אותם בספר המתכונים המשפחתי. אפשר גם לשאול מה לבשל ממה שיש בבית.",
  "tg.cmd.find": "חיפוש בספר",
  "tg.cmd.lots": "מתכונים שמשתמשים בהרבה ממשהו",
  "tg.cmd.swap": "מה לשים במקום",
  "tg.cmd.add": "ייבוא טקסט כמתכון",
  "tg.cmd.help": "מה אני יודע לעשות",
};

/** Everything the bot says, per app language. A new app language needs its words here too. */
export const BOT_WORDS: Record<Locale, Record<BotKey, string>> = { en, he };
