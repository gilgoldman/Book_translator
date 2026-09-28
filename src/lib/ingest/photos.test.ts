import { describe, expect, it } from "vitest";
import { dishPhotos } from "./photos";

const img = (n: number) => ({ url: `https://x/${n}.jpg`, mediaType: "image/jpeg" });

describe("dishPhotos", () => {
  it("uses the dish photos sent with the recipe pages, in order", () => {
    expect(dishPhotos([img(0), img(1), img(2)], [2, 0])).toEqual(["https://x/0.jpg", "https://x/2.jpg"]);
  });

  it("is empty when nothing looked like a dish", () => {
    expect(dishPhotos([img(0), img(1)], [])).toEqual([]);
  });

  it("ignores every-image-is-a-dish: the recipe was read off one of them", () => {
    expect(dishPhotos([img(0)], [0])).toEqual([]);
    expect(dishPhotos([img(0), img(1)], [0, 1, 1])).toEqual([]);
  });

  it("drops indexes that point nowhere or at audio", () => {
    expect(dishPhotos([img(0), img(1)], [1, 5, -1, 1])).toEqual(["https://x/1.jpg"]);
    expect(dishPhotos([{ url: "https://x/a.ogg", mediaType: "audio/ogg" }], [0])).toEqual([]);
  });
});
