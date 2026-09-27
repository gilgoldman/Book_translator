import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { getSession } from "@/lib/auth";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, matchLocale, type Locale } from "./config";
import type { Translator } from "./translate";
import { translatorFor } from "./translator-for";

export { translatorFor };

/**
 * The reader's language: their profile setting, else the language they last picked on
 * this device, else their browser's language, else English.
 */
export const getLocale = cache(async (): Promise<Locale> => {
  const session = await getSession().catch(() => null);
  if (session?.locale) return session.locale;
  const picked = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(picked)) return picked;
  return matchLocale((await headers()).get("accept-language")) ?? DEFAULT_LOCALE;
});

export const getT = cache(async (): Promise<Translator> => translatorFor(await getLocale()));
