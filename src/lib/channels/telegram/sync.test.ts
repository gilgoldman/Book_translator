import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TELEGRAM, TELEGRAM_WORDS } from "./settings";

// scripts/telegram-sync.ts, run as the build runs it, against a stand-in Telegram that prints
// each call instead of making it.

const root = fileURLToPath(new URL("../../../..", import.meta.url));
const standIn = `globalThis.fetch = async (url, init) => {
  console.log("CALL " + JSON.stringify([String(url).split("/").pop(), JSON.parse(init.body)]));
  const refused = process.env.STAND_IN_REFUSES;
  return new Response(JSON.stringify(refused ? { ok: false, description: refused } : { ok: true }));
};`;

function sync(env: Record<string, string>) {
  const run = spawnSync(
    process.execPath,
    ["--import", "tsx", "--import", `data:text/javascript,${encodeURIComponent(standIn)}`, "scripts/telegram-sync.ts"],
    {
      cwd: root,
      encoding: "utf8",
      // Only what's given here: no Vercel variables, and no local .env.
      env: { NODE_ENV: "production", PATH: process.env.PATH ?? "", DOTENV_CONFIG_PATH: "/nonexistent/.env", ...env },
    },
  );
  const lines = run.stdout.trim().split("\n");
  const calls = lines.filter((l) => l.startsWith("CALL ")).map((l) => JSON.parse(l.slice(5)) as [string, Record<string, unknown>]);
  return { status: run.status, calls, said: [...lines.filter((l) => !l.startsWith("CALL ")), run.stderr.trim()].join("\n") };
}

const configured = { TELEGRAM_BOT_TOKEN: "t", TELEGRAM_WEBHOOK_SECRET: "s", APP_URL: "https://book.test/" };

describe("syncing the bot on deploy", () => {
  it("points the webhook at the app, and sets the menu and profile in every language", () => {
    const { status, calls, said } = sync(configured);
    expect(status).toBe(0);
    expect(calls[0]).toEqual([
      "setWebhook",
      { url: "https://book.test/api/telegram", secret_token: "s", allowed_updates: ["message", "callback_query"] },
    ]);
    const menu = (locale: "en" | "he") =>
      TELEGRAM.commands.map((command) => ({ command, description: TELEGRAM_WORDS[locale][`tg.cmd.${command}`] }));
    // English is what everyone else sees; Hebrew is for Telegram set to Hebrew.
    expect(calls.slice(1)).toEqual([
      ["setMyCommands", { commands: menu("en") }],
      ["setMyShortDescription", { short_description: TELEGRAM_WORDS.en["tg.about"] }],
      ["setMyDescription", { description: TELEGRAM_WORDS.en["tg.intro"] }],
      ["setMyCommands", { commands: menu("he"), language_code: "he" }],
      ["setMyShortDescription", { short_description: TELEGRAM_WORDS.he["tg.about"], language_code: "he" }],
      ["setMyDescription", { description: TELEGRAM_WORDS.he["tg.intro"], language_code: "he" }],
    ]);
    expect(said).toContain("Telegram bot synced: webhook, menu and profile in en, he.");
  });

  it("leaves the bot alone on preview builds", () => {
    const { status, calls, said } = sync({ ...configured, VERCEL: "1", VERCEL_ENV: "preview" });
    expect([status, calls]).toEqual([0, []]);
    expect(said).toContain("preview build, bot left as is");
  });

  it("skips without the bot's settings", () => {
    const { status, calls, said } = sync({ APP_URL: "https://book.test" });
    expect([status, calls]).toEqual([0, []]);
    expect(said).toContain("not set, skipping");
  });

  it("never fails the build, but says what Telegram refused", () => {
    const { status, calls, said } = sync({ ...configured, STAND_IN_REFUSES: "Unauthorized" });
    expect(status).toBe(0);
    expect(calls).toHaveLength(7);
    expect(said).toContain("synced with problems (the deploy goes on)");
    expect(said).toContain("setWebhook: Unauthorized");
    expect(said).toContain("he menu: Unauthorized");
  });
});
