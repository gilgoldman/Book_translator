// Turns a recipe web page into text for the extractor. Most recipe sites embed
// schema.org/Recipe JSON-LD, which is far cleaner than the page itself.

const MAX_TEXT = 60_000;

export type FetchedPage = {
  url: string;
  title: string | null;
  image: string | null;
  jsonLd: unknown | null;
  text: string;
};

export async function fetchPage(url: string): Promise<FetchedPage> {
  const res = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36",
      accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Could not open the page (HTTP ${res.status})`);
  const html = await res.text();
  return parsePage(res.url || url, html);
}

export function parsePage(url: string, html: string): FetchedPage {
  const jsonLd = findRecipeJsonLd(html);
  return {
    url,
    title: decodeEntities(matchMeta(html, "og:title") ?? html.match(/<title[^>]*>([^<]*)/i)?.[1] ?? "") || null,
    image: pickImage(jsonLd) ?? matchMeta(html, "og:image"),
    jsonLd,
    text: htmlToText(html).slice(0, MAX_TEXT),
  };
}

/** Text handed to the LLM: structured data when present, page text otherwise. */
export function pageToPrompt(page: FetchedPage): string {
  if (page.jsonLd) {
    return `Structured recipe data (schema.org JSON-LD):\n${JSON.stringify(page.jsonLd).slice(0, MAX_TEXT)}`;
  }
  return `Page title: ${page.title ?? "unknown"}\n\n${page.text}`;
}

export function findRecipeJsonLd(html: string): unknown | null {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) {
    try {
      const found = findRecipeNode(JSON.parse(m[1].trim()));
      if (found) return found;
    } catch {
      // Malformed JSON-LD is common; ignore that block.
    }
  }
  return null;
}

function findRecipeNode(node: unknown): unknown | null {
  if (Array.isArray(node)) {
    for (const n of node) {
      const f = findRecipeNode(n);
      if (f) return f;
    }
    return null;
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    const type = obj["@type"];
    if (type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"))) return obj;
    if (obj["@graph"]) return findRecipeNode(obj["@graph"]);
  }
  return null;
}

function pickImage(jsonLd: unknown): string | null {
  if (!jsonLd || typeof jsonLd !== "object") return null;
  let img = (jsonLd as Record<string, unknown>).image;
  if (Array.isArray(img)) img = img[0];
  if (typeof img === "string") return img;
  if (img && typeof img === "object" && typeof (img as { url?: unknown }).url === "string") {
    return (img as { url: string }).url;
  }
  return null;
}

function matchMeta(html: string, property: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]*content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${property}["']`,
    "i",
  );
  const m = html.match(re);
  return m ? decodeEntities(m[1] ?? m[2]) : null;
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, "\n")
      .replace(/<li[^>]*>/gi, "\n• ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

export function findUrl(text: string): string | null {
  return text.match(/https?:\/\/[^\s<>"']+/i)?.[0] ?? null;
}
