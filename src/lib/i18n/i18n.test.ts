import { describe, expect, it } from "vitest";
import { LOCALE_CODES, matchLocale } from "./config";
import { MESSAGES } from "./messages";
import { rich } from "./translate";
import { translatorFor } from "./translator-for";

describe("i18n", () => {
  it("has every message in every language, with the same placeholders", () => {
    const names = (m: unknown) => [...JSON.stringify(m).matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort();
    for (const code of LOCALE_CODES) {
      for (const [key, value] of Object.entries(MESSAGES.en)) {
        const other = MESSAGES[code][key as keyof typeof MESSAGES.en];
        expect(other, `${code} ${key}`).toBeTruthy();
        // Plural forms like "one" may drop {n}; only check strings.
        if (typeof value === "string") expect(new Set(names(other)), `${code} ${key}`).toEqual(new Set(names(value)));
      }
    }
  });

  it("fills placeholders and picks plural forms", () => {
    const en = translatorFor("en");
    const he = translatorFor("he");
    expect(en("common.addedBy", { name: "Gil" })).toBe("Added by Gil");
    expect(en("import.photos", { n: 1 })).toBe("1 photo chosen");
    expect(en("import.photos", { n: 3 })).toBe("3 photos chosen");
    expect(he("import.photos", { n: 2 })).toBe("נבחרו שתי תמונות");
    expect(he("import.photos", { n: 5 })).toBe("נבחרו 5 תמונות");
  });

  it("matches browser and Telegram languages", () => {
    expect(matchLocale("he-IL,he;q=0.9,en-US;q=0.8")).toBe("he");
    expect(matchLocale("iw")).toBe("he");
    expect(matchLocale("fr-FR,en;q=0.5")).toBe("en");
    expect(matchLocale("fr")).toBe(null);
    expect(matchLocale(undefined)).toBe(null);
  });

  it("splits rich messages around elements", () => {
    expect(rich("New here? {link}", { link: 1 })).toEqual(["New here? ", 1, ""]);
  });
});
