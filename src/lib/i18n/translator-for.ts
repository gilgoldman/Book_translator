// A translator for a known language (Telegram replies, scripts, tests).
import type { Locale } from "./config";
import { MESSAGES } from "./messages";
import { createTranslator } from "./translate";

export const translatorFor = (locale: Locale) => createTranslator(locale, MESSAGES[locale]);
