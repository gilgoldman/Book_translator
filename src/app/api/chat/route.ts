import { getSession } from "@/lib/auth";
import { handleWebInput, parseWebInput } from "@/lib/channels/web";
import { WEB_CHAT, type WebEvent } from "@/lib/channels/web/protocol";
import { getLocale } from "@/lib/i18n/server";
import { isRateLimited } from "@/lib/rate-limit";

export const maxDuration = 300;

// The website's chat. The channel is src/lib/channels/web; the assistant behind it, the same one
// Telegram talks to, is src/lib/assistant. Replies stream back one JSON event per line.

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not signed in" }, { status: 401 });
  if (await isRateLimited(`web-chat:${session.userId}`, WEB_CHAT.perHour, 60 * 60)) {
    return Response.json({ error: "Too many messages" }, { status: 429 });
  }
  const form = await request.formData().catch(() => null);
  const input = form && (await parseWebInput(form));
  if (!input) return Response.json({ error: "Bad request" }, { status: 400 });

  const person = { id: session.userId, locale: session.locale, isAdmin: session.isAdmin };
  const hint = await getLocale();
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: WebEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          // They closed the page; the work still finishes (a recipe still gets saved).
        }
      };
      try {
        await handleWebInput(person, input, emit, hint);
      } catch (err) {
        console.error("web chat failed", err);
        emit({ op: "failed" });
      } finally {
        try {
          controller.close();
        } catch {}
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
