import { describe, expect, it, vi } from "vitest";
import { replyLocale, speaker, usualLocale } from "./language";

describe("which language to answer in", () => {
  it("is the person's app language, else their chat app's, else English", () => {
    expect(usualLocale({ locale: "he" }, "en-US")).toBe("he");
    expect(usualLocale({ locale: null }, "he-IL")).toBe("he");
    expect(usualLocale({ locale: "xx" }, "iw")).toBe("he");
    expect(usualLocale(null, "fr")).toBe("en");
    expect(usualLocale(undefined)).toBe("en");
  });

  it("follows the language they wrote in, not links or commands", () => {
    expect(replyLocale({ locale: "en" }, undefined, "יש לי הרבה כרישות")).toBe("he");
    expect(replyLocale({ locale: "he" }, undefined, "leeks")).toBe("en");
    expect(replyLocale({ locale: "he" }, undefined, "/find https://example.test")).toBe("he");
    expect(replyLocale({ locale: null }, "he", null)).toBe("he");
  });

  it("can always use their usual language instead", async () => {
    vi.resetModules();
    vi.doMock("./persona", async (original) => {
      const persona = await original<typeof import("./persona")>();
      return { ...persona, PERSONA: { ...persona.PERSONA, followWrittenLanguage: false } };
    });
    const { replyLocale: usualOnly } = await import("./language");
    expect(usualOnly({ locale: "en" }, undefined, "יש לי הרבה כרישות")).toBe("en");
    vi.doUnmock("./persona");
  });
});

describe("speaker", () => {
  it("speaks the assistant's words and the app's", () => {
    const t = speaker("he");
    expect(t.locale).toBe("he");
    expect(t("bot.couldnt")).toBe("😕 לא הצלחתי.");
    expect(t("dup.both")).toBeTruthy();
  });

  it("adds a channel's own words when given", () => {
    const t = speaker("en", { en: { "x.hi": "hi {name}" }, he: { "x.hi": "שלום {name}" } });
    expect(t("x.hi", { name: "Gil" })).toBe("hi Gil");
    expect(t("bot.gone")).toBe("🫥 That recipe is gone.");
  });
});
