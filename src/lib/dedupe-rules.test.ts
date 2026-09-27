import { describe, expect, it } from "vitest";
import { ingredientDiff, isLikelyDuplicate } from "./dedupe-rules";

describe("isLikelyDuplicate", () => {
  it("flags near-identical recipes on similarity alone", () => {
    expect(isLikelyDuplicate({ similarity: 0.95, overlap: 0.2, sameTitle: false })).toBe(true);
  });

  it("needs ingredient overlap when only similar", () => {
    expect(isLikelyDuplicate({ similarity: 0.88, overlap: 0.7, sameTitle: false })).toBe(true);
    expect(isLikelyDuplicate({ similarity: 0.88, overlap: 0.3, sameTitle: false })).toBe(false);
  });

  it("trusts a matching title with moderate overlap", () => {
    expect(isLikelyDuplicate({ similarity: 0.7, overlap: 0.5, sameTitle: true })).toBe(true);
    expect(isLikelyDuplicate({ similarity: 0.7, overlap: 0.2, sameTitle: true })).toBe(false);
  });

  it("keeps different dishes apart", () => {
    expect(isLikelyDuplicate({ similarity: 0.8, overlap: 0.5, sameTitle: false })).toBe(false);
  });
});

describe("ingredientDiff", () => {
  it("lists what each version has alone", () => {
    expect(ingredientDiff(["leek", "egg", "Feta"], ["leek", "feta", "cream"])).toEqual({
      added: ["cream"],
      removed: ["egg"],
    });
  });
});
