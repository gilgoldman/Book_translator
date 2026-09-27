import { describe, expect, it } from "vitest";
import { dirFor, formatClock, formatDuration, titleCase } from "./format";

describe("format", () => {
  it("formats durations for pills", () => {
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(30 * 60)).toBe("30 min");
    expect(formatDuration(90 * 60)).toBe("1 h 30");
    expect(formatDuration(2 * 3600)).toBe("2 h");
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
