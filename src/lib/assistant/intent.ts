// What a typed message means, on any channel. Ingredient-first questions ("no buttermilk")
// are searches here; src/lib/ingredient-intent.ts tells them apart.

export type Intent =
  | { kind: "start" }
  | { kind: "help" }
  | { kind: "url"; url: string }
  | { kind: "import"; text: string }
  | { kind: "search"; query: string };

/** Commands win; a bare link is an import; long multi-line text is a pasted recipe. */
export function classifyText(text: string): Intent {
  const t = text.trim();
  if (/^\/start\b/.test(t)) return { kind: "start" };
  if (/^\/help\b/.test(t)) return { kind: "help" };
  const add = t.match(/^\/add(?:@\w+)?\s+([\s\S]+)$/);
  const find = t.match(/^\/(?:find|search)(?:@\w+)?\s+([\s\S]+)$/);
  if (find) return { kind: "search", query: find[1].trim() };
  const body = add ? add[1].trim() : t;
  const url = body.match(/https?:\/\/[^\s<>"']+/i)?.[0];
  if (url && body.length < url.length + 60) return { kind: "url", url };
  if (add || body.length > 280 || body.split("\n").length >= 5) return { kind: "import", text: body };
  return { kind: "search", query: body };
}
