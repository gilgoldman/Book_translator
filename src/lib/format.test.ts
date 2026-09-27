import { describe, expect, it } from "vitest";
import { dirFor } from "./i18n/config";
import { translatorFor } from "./i18n/translator-for";
import { formatClock, formatDuration, titleCase } from "./format";

const en = translatorFor("en");
const he = translatorFor("he");

describe("format", () => {
  it("formats durations for pills", () => {
    expect(formatDuration(45, en)).toBe("45s");
    expect(formatDuration(30 * 60, en)).toBe("30 min");
    expect(formatDuration(90 * 60, en)).toBe("1 h 30");
    expect(formatDuration(2 * 3600, en)).toBe("2 h");
    expect(formatDuration(90 * 60, he)).toBe("1 שע׳ 30 דק׳");
  });

  it("formats clocks for running timers", () => {
    expect(formatClock(5)).toBe("0:05");
    expect(formatClock(605)).toBe("10:05");
    expect(formatClock(3725)).toBe("1:02:05");
  });

  it("knows RTL languages and title-cases tags", () => {
    expect(dirFor("he")).toBe("rtl");
    expect(dirFor("en")).toBe("ltr");
    expect(titleCase("middle-eastern")).toBe("Middle-Eastern");
  });
});
