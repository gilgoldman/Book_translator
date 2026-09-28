import { describe, expect, it } from "vitest";
import { LOCALE_CODES } from "./i18n/config";
import { BOT, BOT_WORDS, type BotKey } from "./telegram-bot";

// Guards for hand edits to telegram-bot.ts: Telegram rejects a whole message over one bad tag.

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("the bot's words", () => {
  it("say the same things in every language, with the same placeholders", () => {
    for (const code of LOCALE_CODES) {
      for (const key of Object.keys(BOT_WORDS.en) as BotKey[]) {
        const word = BOT_WORDS[code][key];
        expect(word, `${code} ${key}`).toBeTruthy();
        expect(placeholders(word), `${code} ${key}`).toEqual(placeholders(BOT_WORDS.en[key]));
      }
    }
  });

  it("use only Telegram's tags, each closed", () => {
    for (const code of LOCALE_CODES) {
      for (const [key, word] of Object.entries(BOT_WORDS[code])) {
        const tags = [...word.matchAll(/<\/?([a-z]+)[^>]*>/g)];
        for (const [, name] of tags) expect(["b", "i", "code"], `${code} ${key}: <${name}>`).toContain(name);
        const opened = tags.filter((t) => !t[0].startsWith("</")).length;
        expect(tags.length - opened, `${code} ${key}: unclosed tag`).toBe(opened);
      }
    }
  });

  it("fit Telegram's limits for the menu and profile", () => {
    for (const code of LOCALE_CODES) {
      const words = BOT_WORDS[code];
      expect(words["tg.about"].length, `${code} tg.about`).toBeLessThanOrEqual(120);
      expect(words["tg.intro"].length, `${code} tg.intro`).toBeLessThanOrEqual(512);
      for (const command of BOT.commands) {
        expect(command).toMatch(/^[a-z0-9_]{1,32}$/);
        const description = words[`tg.cmd.${command}`];
        expect(description.length, `${code} tg.cmd.${command}`).toBeGreaterThanOrEqual(1);
        expect(description.length, `${code} tg.cmd.${command}`).toBeLessThanOrEqual(256);
      }
    }
  });
});
