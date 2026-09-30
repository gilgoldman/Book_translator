import { Fragment, type ReactNode } from "react";
import { parseRich, TAGS, type RichNode } from "@/lib/channels/web/rich";

// The assistant's rich text as React elements. No innerHTML: any other tag stays text.

/** Links in plain text become links. */
function linkify(text: string, key: string): ReactNode[] {
  return text.split(/(https?:\/\/[^\s<>"']+)/).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={`${key}-${i}`} href={part} target="_blank" rel="noreferrer" dir="ltr">
        {part}
      </a>
    ) : (
      part
    ),
  );
}

function render(node: RichNode, key: string): ReactNode {
  const children = node.children.map((c, i) =>
    typeof c === "string" ? <Fragment key={i}>{linkify(c, `${key}.${i}`)}</Fragment> : render(c, `${key}.${i}`),
  );
  if (!node.tag) return <Fragment key={key}>{children}</Fragment>;
  const Element = TAGS[node.tag];
  return <Element key={key}>{children}</Element>;
}

export function RichText({ text }: { text: string }) {
  return <>{render(parseRich(text), "r")}</>;
}
