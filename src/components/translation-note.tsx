import Link from "next/link";
import { dirFor, languageName, type Locale } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";
import type { Localized } from "@/lib/translations";

/** "Translated from Hebrew · Show the original", and the way back. */
export async function TranslationNote({
  localized,
  original,
  showingOriginal,
  path,
}: {
  localized: Localized<unknown>["status"];
  original: string;
  showingOriginal: boolean;
  path: string;
}) {
  const t = await getT();
  const locale: Locale = t.locale;
  if (original === locale) return null;
  if (showingOriginal) {
    return (
      <p className="translation-note">
        {t("recipe.isOriginal", { language: languageName(original, locale) })}{" "}
        <Link href={path}>{t("recipe.showTranslation", { language: languageName(locale, locale) })}</Link>
      </p>
    );
  }
  // An outdated translation is still of these same words; its successor arrives quietly.
  if (localized === "translated" || localized === "outdated") {
    return (
      <p className="translation-note">
        {t("recipe.translatedFrom", { language: languageName(original, locale) })}{" "}
        <Link href={`${path}?original=1`} lang={original} dir={dirFor(original)}>
          {t("recipe.showOriginal")}
        </Link>
      </p>
    );
  }
  if (localized === "pending") {
    return (
      <p className="translation-note" role="status">
        {t("recipe.translating", { language: languageName(locale, locale) })}
      </p>
    );
  }
  return null;
}
