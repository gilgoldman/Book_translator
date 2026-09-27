import { describe, expect, it } from "vitest";
import { findRecipeJsonLd, findUrl, htmlToText, pageToPrompt, parsePage } from "./url";

const recipe = { "@type": "Recipe", name: "Tarte Tatin", image: ["https://x.test/tatin.jpg"] };

describe("findRecipeJsonLd", () => {
  it("finds a Recipe inside an @graph", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [{ "@type": "WebPage" }, recipe],
    })}</script>`;
    expect(findRecipeJsonLd(html)).toEqual(recipe);
  });

  it("handles @type arrays and skips malformed blocks", () => {
    const html = `<script type="application/ld+json">{oops</script>
      <script type='application/ld+json'>[{"@type":["Recipe","NewsArticle"],"name":"Soup"}]</script>`;
    expect(findRecipeJsonLd(html)).toMatchObject({ name: "Soup" });
  });

  it("returns null when there is no recipe", () => {
    expect(findRecipeJsonLd(`<script type="application/ld+json">{"@type":"Article"}</script>`)).toBeNull();
  });
});

describe("parsePage", () => {
  it("prefers JSON-LD for the prompt and picks its image", () => {
    const html = `<html><head><title>Tatin &amp; co</title>
      <script type="application/ld+json">${JSON.stringify(recipe)}</script></head>
      <body><p>Story about my grandmother</p></body></html>`;
    const page = parsePage("https://x.test/r", html);
    expect(page.title).toBe("Tatin & co");
    expect(page.image).toBe("https://x.test/tatin.jpg");
    expect(pageToPrompt(page)).toContain("Tarte Tatin");
  });

  it("falls back to readable text without scripts and styles", () => {
    const html = `<style>.a{}</style><script>alert(1)</script><h1>Soup</h1><ul><li>2 leeks</li><li>1 l stock</li></ul>`;
    const text = htmlToText(html);
    expect(text).toContain("Soup");
    expect(text).toContain("• 2 leeks");
    expect(text).not.toContain("alert");
  });
});

describe("findUrl", () => {
  it("pulls the first link out of a message", () => {
    expect(findUrl("look at this https://site.test/recipe?id=1 yum")).toBe("https://site.test/recipe?id=1");
    expect(findUrl("no link here")).toBeNull();
  });
});
