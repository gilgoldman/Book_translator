import { describe, expect, it } from "vitest";
import { heroPhotos, withCover } from "./photos";

describe("heroPhotos", () => {
  it("puts the recipe's photos first, then note photos, without repeats", () => {
    expect(heroPhotos(["cover", "b"], [{ photos: ["n1", "cover"] }, { photos: [] }, { photos: ["n2"] }])).toEqual([
      "cover",
      "b",
      "n1",
      "n2",
    ]);
  });
});

describe("withCover", () => {
  const all = ["a", "b", "n1"];
  it("moves a recipe photo to the front", () => {
    expect(withCover(["a", "b"], "b", all)).toEqual(["b", "a"]);
  });
  it("brings a note photo in as the cover", () => {
    expect(withCover(["a", "b"], "n1", all)).toEqual(["n1", "a", "b"]);
  });
  it("ignores no choice, the current cover, and unknown URLs", () => {
    expect(withCover(["a", "b"], null, all)).toEqual(["a", "b"]);
    expect(withCover(["a", "b"], "a", all)).toEqual(["a", "b"]);
    expect(withCover(["a", "b"], "https://evil.example/x.jpg", all)).toEqual(["a", "b"]);
  });
});
