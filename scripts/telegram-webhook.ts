// Points the Telegram bot at this deployment and sets its profile and / menu in every app
// language: `npm run telegram:webhook`.
import "dotenv/config";
import { DEFAULT_LOCALE, LOCALE_CODES } from "../src/lib/i18n/config";
import { translatorFor } from "../src/lib/i18n/translator-for";

const { TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, APP_URL } = process.env;
if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_WEBHOOK_SECRET || !APP_URL) {
  console.error("Set TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and APP_URL first.");
  process.exit(1);
}
const api = (method: string, body: object) =>
  fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());

console.log(
  await api("setWebhook", {
    url: `${APP_URL.replace(/\/$/, "")}/api/telegram`,
    secret_token: TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  }),
);

// The default language is what everyone else sees; the others follow the person's Telegram language.
for (const locale of LOCALE_CODES) {
  const t = translatorFor(locale);
  const language = locale === DEFAULT_LOCALE ? {} : { language_code: locale };
  const commands = (["find", "lots", "swap", "add", "help"] as const).map((command) => ({
    command,
    description: t(`tg.cmd.${command}`),
  }));
  console.log(locale, "commands", await api("setMyCommands", { commands, ...language }));
  console.log(locale, "about", await api("setMyShortDescription", { short_description: t("tg.about"), ...language }));
  console.log(locale, "intro", await api("setMyDescription", { description: t("tg.intro"), ...language }));
}
