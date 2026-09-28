import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import type { TgUpdate } from "@/lib/channels/telegram/api";
import { handleUpdate } from "@/lib/channels/telegram/webhook";

export const maxDuration = 300;

// Telegram's webhook. The channel is src/lib/channels/telegram; the assistant behind it is
// src/lib/assistant, its personality in persona.ts.

function secretMatches(given: string | null) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!secretMatches(request.headers.get("x-telegram-bot-api-secret-token"))) {
    return new Response("forbidden", { status: 403 });
  }
  const update = (await request.json()) as TgUpdate;
  // Answer Telegram at once; the slow work runs after the response.
  after(() =>
    handleUpdate(update).catch((err) => {
      console.error("telegram update failed", err);
    }),
  );
  return Response.json({ ok: true });
}
