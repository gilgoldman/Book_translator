import { describe, expect, it } from "vitest";
import { cuisinesIn, parseMenuAsk, parsePersonAsk, planMenu } from "./asks";

describe("parsePersonAsk", () => {
  it("finds who, in English", () => {
    expect(parsePersonAsk("show me all recipes from user Dana")).toEqual({ kind: "person", who: "Dana" });
    expect(parsePersonAsk("recipes by @dana_g")).toEqual({ kind: "person", who: "dana_g" });
    expect(parsePersonAsk("recipes added by Dana Levi?")).toEqual({ kind: "person", who: "Dana Levi" });
    expect(parsePersonAsk("Show me Dana's recipes")).toEqual({ kind: "person", who: "Dana" });
    expect(parsePersonAsk("what did Dana add?")).toEqual({ kind: "person", who: "Dana" });
  });

  it("finds who, in Hebrew", () => {
    expect(parsePersonAsk("המתכונים של דנה")).toEqual({ kind: "person", who: "דנה" });
    expect(parsePersonAsk("תראה לי מתכונים של המשתמש דנה")).toEqual({ kind: "person", who: "דנה" });
    expect(parsePersonAsk("מה דנה העלתה?")).toEqual({ kind: "person", who: "דנה" });
    expect(parsePersonAsk("כל המתכונים שדנה הוסיפה")).toEqual({ kind: "person", who: "דנה" });
  });

  it("leaves other questions alone", () => {
    expect(parsePersonAsk("leeks, eggs, feta")).toBeNull();
    expect(parsePersonAsk("that lemony chicken")).toBeNull();
    expect(parsePersonAsk("recipes from the old blue notebook that grandma kept")).toBeNull();
  });
});

describe("cuisinesIn", () => {
  it("knows cuisines by name in either language, and regions", () => {
    expect(cuisinesIn("italian")).toEqual({ cuisines: ["italian"], rest: [] });
    expect(cuisinesIn("middle-eastern with eggplant").cuisines).toEqual(["middle-eastern"]);
    expect(cuisinesIn("north african").cuisines).toEqual(["north-african"]);
    expect(cuisinesIn("איטלקית עם חציל")).toEqual({ cuisines: ["italian"], rest: ["עם", "חציל"] });
    expect(cuisinesIn("מהמטבח האיטלקי").cuisines).toEqual(["italian"]);
    expect(cuisinesIn("from Italy").cuisines).toEqual(["italian"]);
    expect(cuisinesIn("asian").cuisines).toContain("japanese");
  });

  it("finds none in plain ingredients", () => {
    expect(cuisinesIn("eggplant and feta").cuisines).toEqual([]);
  });
});

describe("parseMenuAsk", () => {
  it("knows the meal, the cuisine and what else they want", () => {
    expect(parseMenuAsk("I want to compile a dinner from Italian cuisine. Let's build a menu")).toMatchObject({
      meal: "dinner",
      cuisines: ["italian"],
      rest: "",
      wants: "italian",
    });
    expect(parseMenuAsk("lunch menu with eggplant")).toMatchObject({ meal: "lunch", cuisines: [], rest: "eggplant" });
    expect(parseMenuAsk("plan a Levantine lunch with chickpeas")).toMatchObject({
      meal: "lunch",
      cuisines: ["levantine"],
      rest: "chickpeas",
    });
    expect(parseMenuAsk("build me a brunch")).toMatchObject({ meal: "brunch", rest: "", cuisines: [] });
    expect(parseMenuAsk("let's build a menu")).toMatchObject({ meal: "dinner" });
  });

  it("speaks Hebrew", () => {
    expect(parseMenuAsk("בוא נבנה תפריט לארוחת ערב איטלקית")).toMatchObject({ meal: "dinner", cuisines: ["italian"], rest: "" });
    expect(parseMenuAsk("תרכיב לי ארוחת צהריים עם חצילים")).toMatchObject({ meal: "lunch", cuisines: [], rest: "חצילים" });
  });

  it("isn't every mention of a meal", () => {
    expect(parseMenuAsk("what can I make for dinner with leeks")).toBeNull();
    expect(parseMenuAsk("leeks, eggs, feta")).toBeNull();
  });
});

describe("planMenu", () => {
  const dish = (id: string, course: string) => ({ id, title: id, course });

  it("takes the best fit for each course, in course order, skipping courses nothing fits", () => {
    const picked = planMenu("dinner", [dish("cake", "dessert"), dish("stew", "main"), dish("soup", "soup"), dish("roast", "main")]);
    expect(picked.map((d) => d.id)).toEqual(["soup", "stew", "cake"]);
  });

  it("uses a dish once", () => {
    expect(planMenu("lunch", [dish("salad", "salad")]).map((d) => d.id)).toEqual(["salad"]);
  });
});
