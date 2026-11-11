import { describe, expect, it } from "vitest";
import { localAmount, measurable, parseQuantity, scaleAmount } from "./amounts";

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

describe("parseQuantity", () => {
  it("reads the ways people type a scale", () => {
    expect(parseQuantity("2")).toBe(2);
    expect(parseQuantity("0.3")).toBe(0.3);
    expect(parseQuantity("0,3")).toBe(0.3);
    expect(parseQuantity("1/2")).toBe(0.5);
    expect(parseQuantity("1 1/2")).toBe(1.5);
    expect(parseQuantity("½")).toBe(0.5);
    expect(parseQuantity("x5")).toBe(5);
    expect(parseQuantity("2×")).toBe(2);
    expect(parseQuantity("lots")).toBeNaN();
    expect(parseQuantity("")).toBeNaN();
  });
});

describe("scaleAmount", () => {
  it("leaves the text alone at 1×", () => {
    expect(scaleAmount("4.2 cups", 1)).toBe("4.2 cups");
  });

  it("scales cups, spoons and pieces to measurable fractions", () => {
    expect(scaleAmount("1 ½ cups", 2)).toBe("3 cups");
    expect(scaleAmount("¾ cup", 0.5)).toBe("⅓ cup");
    expect(scaleAmount("1/2 tsp", 2)).toBe("1 tsp");
    expect(scaleAmount("3 eggs", 0.5)).toBe("1 ½ eggs");
    expect(scaleAmount("2 כוסות", 0.5)).toBe("1 כוסות");
  });

  it("scales weights and volumes to plain numbers", () => {
    expect(scaleAmount("220 g", 0.3)).toBe("66 g");
    expect(scaleAmount("1.5 kg", 2)).toBe("3 kg");
    expect(scaleAmount("250 ml", 0.3)).toBe("75 ml");
    expect(scaleAmount("5 g", 0.3)).toBe("1.5 g");
    expect(scaleAmount("200 גרם", 5)).toBe("1000 גרם");
  });

  it("scales every number in the amount, ranges included", () => {
    expect(scaleAmount("1 medium onion (≈150 g)", 2)).toBe("2 medium onion (≈300 g)");
    expect(scaleAmount("2-3 cloves", 2)).toBe("4-6 cloves");
  });

  it("keeps tiny amounts visible", () => {
    expect(scaleAmount("¼ tsp", 0.3)).toBe("0.1 tsp");
  });

  it("works with Hebrew unit words afterwards", () => {
    expect(localAmount(scaleAmount("1 cup", 1.5), "he")).toBe("1 ½ כוסות");
  });
});
