import { describe, expect, it } from "vitest";
import { findIngredientLine, parseIngredientIntent, singular } from "./ingredient-intent";

describe("parseIngredientIntent", () => {
  it.each([
    ["I have a lot of leeks", "leeks"],
    ["lots of zucchini, what can I make?", "zucchini"],
    ["need to use up the buttermilk", "buttermilk"],
    ["leftover rice", "rice"],
    ["/lots courgettes", "courgettes"],
  ])("abundance: %s", (q, ingredient) => {
    expect(parseIngredientIntent(q)).toEqual({ kind: "abundance", ingredient });
  });

  it.each([
    ["I don't have buttermilk", "buttermilk"],
    ["what can I use instead of eggs in this cake?", "eggs"],
    ["ran out of brown sugar", "brown sugar"],
    ["no heavy cream?", "heavy cream"],
    ["substitute for tahini", "tahini"],
    ["/swap crème fraîche", "crème fraîche"],
  ])("substitute: %s", (q, ingredient) => {
    expect(parseIngredientIntent(q)).toEqual({ kind: "substitute", ingredient });
  });

  it.each([
    ["I don't have buttermilk, would yogurt work?", "buttermilk", "yogurt"],
    ["no buttermilk. Can I use Greek yogurt instead?", "buttermilk", "greek yogurt"],
    ["out of eggs - what about flax?", "eggs", "flax"],
    ["I don't have cream but would milk do", "cream", "milk"],
    ["no butter would olive oil be ok", "butter", "olive oil"],
    ["can I use honey instead of sugar?", "sugar", "honey"],
    ["would oil work instead of butter in this cake", "butter", "oil"],
    ["replace buttermilk with kefir", "buttermilk", "kefir"],
    ["swap the cream for milk?", "cream", "milk"],
    ["substitute margarine for butter", "butter", "margarine"],
  ])("substitute with a candidate: %s", (q, ingredient, candidate) => {
    expect(parseIngredientIntent(q)).toEqual({ kind: "substitute", ingredient, candidate });
  });

  it("asks for ideas when no candidate is named", () => {
    expect(parseIngredientIntent("no buttermilk, what can I use?")).toEqual({ kind: "substitute", ingredient: "buttermilk" });
    expect(parseIngredientIntent("no buttermilk, can I use something else?")).toEqual({
      kind: "substitute",
      ingredient: "buttermilk",
    });
    expect(parseIngredientIntent("what can I replace butter with?")).toEqual({ kind: "substitute", ingredient: "butter" });
  });

  it("leaves ordinary searches alone", () => {
    expect(parseIngredientIntent("leeks, eggs, feta")).toBeNull();
    expect(parseIngredientIntent("that lemony chicken thing")).toBeNull();
    expect(parseIngredientIntent("no-bake cheesecake")).toBeNull();
    expect(parseIngredientIntent("what can I cook with leeks")).toBeNull();
  });
});

describe("findIngredientLine", () => {
  const lines = [
    { name: "Buttermilk", canonical: "buttermilk" },
    { name: "חמאה רכה", canonical: "butter" },
    { name: "Cherry tomatoes", canonical: "cherry tomato" },
  ];

  it("finds the line by canonical name, then by the words used", () => {
    expect(findIngredientLine(lines, "butter", "butter")).toBe(1);
    expect(findIngredientLine(lines, "unknown", "חמאה")).toBe(1);
    expect(findIngredientLine(lines, "tomato", "tomatoes")).toBe(2);
  });

  it("is -1 when the recipe doesn't use it", () => {
    expect(findIngredientLine(lines, "egg", "eggs")).toBe(-1);
    expect(findIngredientLine(lines, "egg", "")).toBe(-1);
  });
});

describe("singular", () => {
  it("singularises the last word only", () => {
    expect(singular("leeks")).toBe("leek");
    expect(singular("cherry tomatoes")).toBe("cherry tomato");
    expect(singular("brussels sprouts")).toBe("brussels sprout");
    expect(singular("berries")).toBe("berry");
    expect(singular("molasses")).toBe("molasses");
  });
});

describe("parseIngredientIntent (Hebrew)", () => {
  it("recognises abundance", () => {
    expect(parseIngredientIntent("יש לי הרבה כרישות")).toEqual({ kind: "abundance", ingredient: "כרישות" });
    expect(parseIngredientIntent("המון עגבניות, מה אפשר להכין?")).toEqual({ kind: "abundance", ingredient: "עגבניות" });
    expect(parseIngredientIntent("צריך לגמור את הקישואים")).toEqual({ kind: "abundance", ingredient: "הקישואים" });
  });

  it("recognises substitutes", () => {
    expect(parseIngredientIntent("אין לי רוויון")).toEqual({ kind: "substitute", ingredient: "רוויון" });
    expect(parseIngredientIntent("נגמר לי החלב")).toEqual({ kind: "substitute", ingredient: "החלב" });
    expect(parseIngredientIntent("במקום חמאה")).toEqual({ kind: "substitute", ingredient: "חמאה" });
    expect(parseIngredientIntent("תחליף לביצים בעוגה")).toEqual({ kind: "substitute", ingredient: "ביצים" });
  });

  it("recognises a candidate", () => {
    const swap = (ingredient: string, candidate: string) => ({ kind: "substitute", ingredient, candidate });
    expect(parseIngredientIntent("אין לי חלב, אפשר יוגורט?")).toEqual(swap("חלב", "יוגורט"));
    expect(parseIngredientIntent("אין לי רוויון אפשר להשתמש ביוגורט?")).toEqual(swap("רוויון", "יוגורט"));
    expect(parseIngredientIntent("נגמרה לי החמאה, מה עם שמן?")).toEqual(swap("החמאה", "שמן"));
    expect(parseIngredientIntent("אפשר שמן זית במקום חמאה?")).toEqual(swap("חמאה", "שמן זית"));
    expect(parseIngredientIntent("אפשר להחליף חמאה בשמן?")).toEqual(swap("חמאה", "שמן"));
    expect(parseIngredientIntent("במקום סוכר אפשר דבש?")).toEqual(swap("סוכר", "דבש"));
  });

  it("leaves ordinary searches alone", () => {
    expect(parseIngredientIntent("עוף בלימון")).toBe(null);
    expect(parseIngredientIntent("כרישה, ביצים, פטה")).toBe(null);
  });
});
