import { describe, expect, it } from "vitest";
import { localAmount, measurable } from "./amounts";

describe("measurable", () => {
  it("rounds to what measuring cups and spoons have", () => {
    expect(measurable(4.2)).toBe("4 ¼");
    expect(measurable(5.4)).toBe("5 ⅓");
    expect(measurable(0.5)).toBe("½");
    expect(measurable(0.7)).toBe("⅔");
    expect(measurable(2.95)).toBe("3");
    expect(measurable(3)).toBe("3");
  });
});

describe("localAmount", () => {
  it("turns decimal cups and spoons into fractions, in any language", () => {
    expect(localAmount("4.2 cups", "en")).toBe("4 ¼ cups");
    expect(localAmount("1.5 tbsp", "en")).toBe("1 ½ tbsp");
    expect(localAmount("4.2 כוסות", "he")).toBe("4 ¼ כוסות");
  });

  it("leaves weights and other decimals alone", () => {
    expect(localAmount("1.5 kg", "en")).toBe("1.5 kg");
    expect(localAmount("2.5 l", "en")).toBe("2.5 l");
  });

  it("writes unit words in Hebrew for a Hebrew reader, one or many", () => {
    expect(localAmount("1 ½ cups", "he")).toBe("1 ½ כוסות");
    expect(localAmount("1 cup", "he")).toBe("1 כוס");
    expect(localAmount("½ cup", "he")).toBe("½ כוס");
    expect(localAmount("1 tsp", "he")).toBe("1 כפית");
    expect(localAmount("1 ½ tbsp", "he")).toBe("1 ½ כפות");
    expect(localAmount("250 ml", "he")).toBe("250 מ״ל");
    expect(localAmount("220 g", "he")).toBe("220 גרם");
    expect(localAmount("5.4 cups", "he")).toBe("5 ⅓ כוסות");
    expect(localAmount("1 medium onion (≈150 g)", "he")).toBe("1 medium onion (≈150 גרם)");
  });

  it("leaves words that only start like a unit, and English readers, alone", () => {
    expect(localAmount("2 large eggs", "he")).toBe("2 large eggs");
    expect(localAmount("1 cup", "en")).toBe("1 cup");
    expect(localAmount("2 כפות", "he")).toBe("2 כפות");
  });
});
