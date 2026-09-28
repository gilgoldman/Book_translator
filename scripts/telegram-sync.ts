// Brings the Telegram bot in line with this deployment: its webhook, / menu and profile texts
// in every app language (all set in src/lib/channels/telegram/settings.ts). Runs by itself
// after every production build on Vercel; `npm run telegram:sync` does the same by hand.
// Never fails the build: at worst the bot keeps its previous menu and profile.
import "dotenv/config";
import { DEFAULT_LOCALE, LOCALE_CODES } from "../src/lib/i18n/config";
import { TELEGRAM, TELEGRAM_WORDS } from "../src/lib/channels/telegram/settings";

const { TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, APP_URL, VERCEL, VERCEL_ENV } = process.env;

// Preview builds share the bot with production; only production may change it.
if (VERCEL && VERCEL_ENV !== "production") {
  console.log("Telegram: preview build, bot left as is.");
  process.exit(0);
}
if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_WEBHOOK_SECRET || !APP_URL) {
  console.log("Telegram: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET or APP_URL not set, skipping.");
  process.exit(0);
}

const failures: string[] = [];

async function call(method: string, body: object, what = method) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => null)) as { ok: boolean; description?: string } | null;
    if (!json?.ok) failures.push(`${what}: ${json?.description ?? `HTTP ${res.status}`}`);
  } catch (err) {
    failures.push(`${what}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Messages sent during a deploy wait in Telegram's queue and arrive once it's done.
await call("setWebhook", {
  url: `${APP_URL.replace(/\/$/, "")}/api/telegram`,
  secret_token: TELEGRAM_WEBHOOK_SECRET,
  allowed_updates: ["message", "callback_query"],
});

// The default language is what everyone else sees; the others follow each person's Telegram language.
for (const locale of LOCALE_CODES) {
  const words = TELEGRAM_WORDS[locale];
  const language = locale === DEFAULT_LOCALE ? {} : { language_code: locale };
  const commands = TELEGRAM.commands.map((command) => ({ command, description: words[`tg.cmd.${command}`] }));
  await call("setMyCommands", { commands, ...language }, `${locale} menu`);
  await call("setMyShortDescription", { short_description: words["tg.about"], ...language }, `${locale} about`);
  await call("setMyDescription", { description: words["tg.intro"], ...language }, `${locale} intro`);
}

if (failures.length) console.warn(`Telegram: synced with problems (the deploy goes on):\n  ${failures.join("\n  ")}`);
else console.log(`Telegram bot synced: webhook, menu and profile in ${LOCALE_CODES.join(", ")}.`);
process.exit(0);
