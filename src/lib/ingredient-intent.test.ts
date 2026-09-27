import { describe, expect, it } from "vitest";
import { parseIngredientIntent, singular } from "./ingredient-intent";

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

  it("leaves ordinary searches alone", () => {
    expect(parseIngredientIntent("leeks, eggs, feta")).toBeNull();
    expect(parseIngredientIntent("that lemony chicken thing")).toBeNull();
    expect(parseIngredientIntent("no-bake cheesecake")).toBeNull();
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

  it("leaves ordinary searches alone", () => {
    expect(parseIngredientIntent("עוף בלימון")).toBe(null);
    expect(parseIngredientIntent("כרישה, ביצים, פטה")).toBe(null);
  });
});
