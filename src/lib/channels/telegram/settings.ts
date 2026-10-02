import type { Locale } from "@/lib/i18n/config";

// ─────────────────────────────────────────────────────────────────────────────────────────
// WHAT ONLY TELEGRAM HAS
//
// The assistant's personality, and everything it says in a chat, is in
// src/lib/assistant/persona.ts. Here: Telegram's / menu and profile, and signing in with
// /login. Same rules for the words as there. Every production deploy sends the menu and the
// profile texts to Telegram (scripts/telegram-sync.ts); look for "Telegram bot synced" in the
// build log.
// ─────────────────────────────────────────────────────────────────────────────────────────

export const TELEGRAM = {
  /** The / menu, in this order. Each needs a "tg.cmd.<name>" line in the words below. */
  commands: ["find", "lots", "swap", "fix", "add", "help"],

  /** How long to wait for the rest of a photo album before reading it as one recipe. */
  albumWaitMs: 2500,
} as const;

const en = {
  // Signing in
  "tg.private": "👋 Hi! This is a private family cookbook 📖\nConnect with:\n<code>/login username password</code>",
  "tg.connected": "🎉 Hi {name}, you're in!",
  "tg.pending": "⏳ Still waiting for approval.",
  "tg.tooManyLogins": "🛑 Too many tries. Wait 15 minutes, then try again.",

  // The bot's profile (up to 120 and 512 characters) and / menu (up to 256 each).
  "tg.about": "Our family cookbook 📖 Send recipes, ask what to cook.",
  "tg.intro":
    "👋 Send me recipes as photos, links, voice notes or text and I'll file them in the family cookbook. Ask me what to cook with what you have.",
  "tg.cmd.find": "Search the cookbook",
  "tg.cmd.lots": "Recipes that use a lot of something",
  "tg.cmd.swap": "What to use instead",
  "tg.cmd.fix": "Correct a recipe you added",
  "tg.cmd.add": "Import pasted text as a recipe",
  "tg.cmd.help": "What I can do",
};

export type TelegramKey = keyof typeof en;

const he: Record<TelegramKey, string> = {
  "tg.private": "👋 היי! זה ספר מתכונים משפחתי ופרטי 📖\nאפשר להתחבר עם:\n<code>/login username password</code>",
  "tg.connected": "🎉 היי {name}, התחברת!",
  "tg.pending": "⏳ עדיין מחכה לאישור.",
  "tg.tooManyLogins": "🛑 יותר מדי ניסיונות. כדאי לחכות 15 דקות ולנסות שוב.",

  "tg.about": "ספר המתכונים המשפחתי שלנו 📖 שלחו מתכונים, שאלו מה לבשל.",
  "tg.intro":
    "👋 שלחו לי מתכונים בתמונה, בקישור, בהקלטה או בטקסט ואתייק אותם בספר המתכונים המשפחתי. אפשר גם לשאול מה לבשל ממה שיש בבית.",
  "tg.cmd.find": "חיפוש בספר",
  "tg.cmd.lots": "מתכונים שמשתמשים בהרבה ממשהו",
  "tg.cmd.swap": "מה לשים במקום",
  "tg.cmd.fix": "תיקון מתכון שהוספת",
  "tg.cmd.add": "ייבוא טקסט כמתכון",
  "tg.cmd.help": "מה אני יודע לעשות",
};

/** Telegram's own words, per app language. */
export const TELEGRAM_WORDS: Record<Locale, Record<TelegramKey, string>> = { en, he };
