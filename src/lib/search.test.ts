import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/extract", () => ({ embedText: vi.fn() }));
vi.mock("@/db", () => ({ db: vi.fn(), recipes: {} }));

const { queryVariants } = await import("./search");

const matches = (q: string, name: string) => queryVariants(q).includes(` ${name} `);

describe("queryVariants", () => {
  it("matches plural pantry words to singular canonical names", () => {
    expect(matches("I have leeks, eggs and feta", "leek")).toBe(true);
    expect(matches("I have leeks, eggs and feta", "egg")).toBe(true);
    expect(matches("I have leeks, eggs and feta", "feta")).toBe(true);
    expect(matches("tomatoes", "tomato")).toBe(true);
    expect(matches("cherries", "cherry")).toBe(true);
  });

  it("keeps multi-word ingredients together", () => {
    expect(matches("green onions and rice", "green onion")).toBe(true);
    expect(matches("onions and green beans", "green onion")).toBe(false);
  });

  it("does not match inside other words", () => {
    expect(matches("eggplant", "egg")).toBe(false);
    expect(matches("glass", "glas")).toBe(false);
  });
});
