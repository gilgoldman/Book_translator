import { setLanguage } from "@/app/actions";
import { LOCALE_CODES, LOCALES } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";
import { Icon } from "./icons";

/**
 * One button per other language, labelled in that language ("עברית"), so someone who
 * can't read the current one still finds theirs. Works without JavaScript.
 */
export async function LanguageSwitch() {
  const t = await getT();
  return (
    <>
      {LOCALE_CODES.filter((code) => code !== t.locale).map((code) => (
        <form key={code} action={setLanguage.bind(null, code)} className="lang-switch">
          <button
            className="btn"
            lang={code}
            dir={LOCALES[code].dir}
            title={t("lang.switch", { language: LOCALES[code].name })}
          >
            <Icon name="globe" /> {LOCALES[code].name}
          </button>
        </form>
      ))}
    </>
  );
}
