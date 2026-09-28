import { describe, expect, it } from "vitest";
import { classifyText } from "./intent";

describe("classifyText", () => {
  it("understands commands", () => {
    expect(classifyText("/help")).toEqual({ kind: "help" });
    expect(classifyText("/find leeks")).toEqual({ kind: "search", query: "leeks" });
    expect(classifyText("/find@CookbookBot leeks")).toEqual({ kind: "search", query: "leeks" });
  });

  it("treats a bare link as an import", () => {
    expect(classifyText("https://example.test/tatin")).toEqual({ kind: "url", url: "https://example.test/tatin" });
  });

  it("treats short text as a search and long text as a pasted recipe", () => {
    expect(classifyText("leeks, eggs, feta")).toEqual({ kind: "search", query: "leeks, eggs, feta" });
    expect(classifyText("Soup\n2 leeks\n1 l stock\nSweat leeks\nAdd stock").kind).toBe("import");
    expect(classifyText("/add Leek soup")).toEqual({ kind: "import", text: "Leek soup" });
  });
});
