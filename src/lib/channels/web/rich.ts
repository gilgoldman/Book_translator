// The assistant's rich text (<b>, <i>, <code>, everything else HTML-escaped; see
// src/lib/assistant/render.ts) as a tree, for the website's chat to draw without innerHTML.

const TOKEN = /<(\/?)(b|i|code)>|&(amp|lt|gt|quot|#39);/g;
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" };
export const TAGS = { b: "strong", i: "em", code: "code" } as const;
type Tag = keyof typeof TAGS;
export type RichNode = { tag: Tag | null; children: (RichNode | string)[] };

export function parseRich(text: string): RichNode {
  const root: RichNode = { tag: null, children: [] };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  const addText = (s: string) => {
    if (!s) return;
    const kids = top().children;
    if (typeof kids[kids.length - 1] === "string") kids[kids.length - 1] += s;
    else kids.push(s);
  };
  let at = 0;
  for (const m of text.matchAll(TOKEN)) {
    addText(text.slice(at, m.index));
    at = m.index + m[0].length;
    if (m[3]) addText(ENTITIES[m[3]]);
    else if (!m[1]) {
      const node: RichNode = { tag: m[2] as Tag, children: [] };
      top().children.push(node);
      stack.push(node);
    } else if (stack.some((n) => n.tag === m[2])) {
      while (stack.length > 1 && stack.pop()!.tag !== m[2]);
    }
  }
  addText(text.slice(at));
  return root;
}
