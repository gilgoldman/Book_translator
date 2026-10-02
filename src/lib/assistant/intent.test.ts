import { describe, expect, it } from "vitest";
import { classifyText } from "./intent";

describe("classifyText", () => {
  it("understands commands", () => {
    expect(classifyText("/start")).toEqual({ kind: "start" });
    expect(classifyText("/start from-profile")).toEqual({ kind: "start" });
    expect(classifyText("/help")).toEqual({ kind: "help" });
    expect(classifyText("/search lemony chicken")).toEqual({ kind: "search", query: "lemony chicken" });
    expect(classifyText("/find leeks")).toEqual({ kind: "search", query: "leeks" });
    expect(classifyText("/find@CookbookBot leeks")).toEqual({ kind: "search", query: "leeks" });
    expect(classifyText("/fix it's 180, not 200")).toEqual({ kind: "fix", text: "it's 180, not 200" });
  });

  it("treats a link with a few words around it as an import", () => {
    expect(classifyText("https://example.test/tatin")).toEqual({ kind: "url", url: "https://example.test/tatin" });
    expect(classifyText("try this https://example.test/tatin!")).toEqual({ kind: "url", url: "https://example.test/tatin!" });
    expect(classifyText("/add https://example.test/tatin")).toEqual({ kind: "url", url: "https://example.test/tatin" });
    const chatty = `my aunt's tatin, she says to use much less sugar and more butter than it says https://example.test/tatin`;
    expect(classifyText(chatty)).toEqual({ kind: "search", query: chatty });
  });

  it("treats short text as a search and long text as a pasted recipe", () => {
    expect(classifyText("leeks, eggs, feta")).toEqual({ kind: "search", query: "leeks, eggs, feta" });
    expect(classifyText("Soup\n2 leeks\n1 l stock\nSweat leeks\nAdd stock").kind).toBe("import");
    expect(classifyText("/add Leek soup")).toEqual({ kind: "import", text: "Leek soup" });
    expect(classifyText("x".repeat(281)).kind).toBe("import");
    expect(classifyText("x".repeat(280)).kind).toBe("search");
  });
});
