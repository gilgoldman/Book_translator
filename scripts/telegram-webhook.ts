// Points the Telegram bot at this deployment: `npm run telegram:webhook`.
import "dotenv/config";

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
console.log(
  await api("setMyCommands", {
    commands: [
      { command: "find", description: "Search the cookbook" },
      { command: "add", description: "Import pasted text as a recipe" },
      { command: "help", description: "What I can do" },
    ],
  }),
);
