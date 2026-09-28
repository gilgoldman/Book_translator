import { describe, expect, it } from "vitest";
import { LOCALE_CODES } from "@/lib/i18n/config";
import { WORDS, type WordKey } from "./persona";

// Guards for hand edits to persona.ts: Telegram rejects a whole message over one bad tag.

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("the assistant's words", () => {
  it("say the same things in every language, with the same placeholders", () => {
    for (const code of LOCALE_CODES) {
      for (const key of Object.keys(WORDS.en) as WordKey[]) {
        const word = WORDS[code][key];
        expect(word, `${code} ${key}`).toBeTruthy();
        expect(placeholders(word), `${code} ${key}`).toEqual(placeholders(WORDS.en[key]));
      }
    }
  });

  it("use only the rich-text tags, each closed", () => {
    for (const code of LOCALE_CODES) {
      for (const [key, word] of Object.entries(WORDS[code])) {
        const tags = [...word.matchAll(/<\/?([a-z]+)[^>]*>/g)];
        for (const [, name] of tags) expect(["b", "i", "code"], `${code} ${key}: <${name}>`).toContain(name);
        const opened = tags.filter((t) => !t[0].startsWith("</")).length;
        expect(tags.length - opened, `${code} ${key}: unclosed tag`).toBe(opened);
      }
    }
  });
});
