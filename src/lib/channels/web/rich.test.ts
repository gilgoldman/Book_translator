import { describe, expect, it } from "vitest";
import { parseRich } from "./rich";

describe("parseRich", () => {
  it("nests the assistant's tags and decodes what render.ts escaped", () => {
    expect(parseRich("🍰 <b>Tom &amp; Jerry's <i>cake</i></b>\n<code>1:2</code> a &lt;b&gt; c")).toEqual({
      tag: null,
      children: [
        "🍰 ",
        { tag: "b", children: ["Tom & Jerry's ", { tag: "i", children: ["cake"] }] },
        "\n",
        { tag: "code", children: ["1:2"] },
        " a <b> c",
      ],
    });
  });

  it("keeps any other tag as text", () => {
    expect(parseRich('<img src=x onerror="alert(1)"><script>x</script>')).toEqual({
      tag: null,
      children: ['<img src=x onerror="alert(1)"><script>x</script>'],
    });
  });

  it("survives a message clipped mid-way and stray closing tags", () => {
    expect(parseRich("<b>open </i>end")).toEqual({ tag: null, children: [{ tag: "b", children: ["open end"] }] });
  });
});
