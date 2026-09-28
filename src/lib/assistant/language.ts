import { DEFAULT_LOCALE, detectLocale, isLocale, matchLocale, type Locale } from "@/lib/i18n/config";
import { MESSAGES } from "@/lib/i18n/messages";
import { createTranslator, type Message, type MessageKey, type Translator } from "@/lib/i18n/translate";
import { PERSONA, WORDS, type WordKey } from "./persona";

/** The assistant's words plus the app's, in one language. */
export type Speaker = Translator<MessageKey | WordKey>;

/** The assistant's words plus the app's, and a channel's own words if it has some. */
export function speaker<K extends string = never>(
  locale: Locale,
  channelWords?: Record<Locale, Record<K, string>>,
): Translator<MessageKey | WordKey | K> {
  const words = { ...MESSAGES[locale], ...WORDS[locale], ...channelWords?.[locale] };
  return createTranslator(locale, words as Record<MessageKey | WordKey | K, Message>);
}

/** The person's app language, else the channel's guess, else the default. */
export function usualLocale(person: { locale: string | null } | null | undefined, hint?: string): Locale {
  return isLocale(person?.locale) ? person.locale : (matchLocale(hint) ?? DEFAULT_LOCALE);
}

/** The language they wrote to us in (Hebrew or English), else their `usualLocale`. */
export function replyLocale(
  person: { locale: string | null } | null | undefined,
  hint?: string,
  said?: string | null,
): Locale {
  const written = PERSONA.followWrittenLanguage ? detectLocale(said) : null;
  return written ?? usualLocale(person, hint);
}
