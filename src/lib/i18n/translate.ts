import type { Locale } from "./config";
import type { en } from "./messages/en";

// Tiny message formatter: "{name}" placeholders and plural forms, nothing else.
// Safe to use on both the server and the client.

export type MessageKey = keyof typeof en;
type Plural = { zero?: string; one?: string; two?: string; few?: string; many?: string; other: string };
export type Message = string | Plural;
export type Messages = Record<MessageKey, Message>;
export type Vars = Record<string, string | number>;
/** Looks up words by key; the app's by default, or another set such as the chat assistant's. */
export type Translator<K extends string = MessageKey> = ((key: K, vars?: Vars) => string) & { locale: Locale };

const fill = (template: string, vars?: Vars) =>
  vars ? template.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m)) : template;

export function createTranslator<K extends string = MessageKey>(
  locale: Locale,
  messages: Record<K, Message>,
): Translator<K> {
  const plurals = new Intl.PluralRules(locale);
  const t = (key: K, vars?: Vars) => {
    const message = messages[key];
    if (message === undefined) return key; // only for keys built at runtime from stored data
    if (typeof message === "string") return fill(message, vars);
    const form = plurals.select(Number(vars?.n ?? 0)) as keyof Plural;
    return fill(message[form] ?? message.other, vars);
  };
  return Object.assign(t, { locale });
}

/**
 * Splits a message around {placeholders} so React elements can go in them:
 * rich(t("login.newHere"), { link: <Link …/> }).
 */
export function rich<T>(text: string, parts: Record<string, T>): (string | T)[] {
  return text.split(/(\{\w+\})/).map((piece) => {
    const name = piece.match(/^\{(\w+)\}$/)?.[1];
    return name && name in parts ? parts[name] : piece;
  });
}
