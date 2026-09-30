import type { Reply } from "@/lib/assistant/chat";

// What the website's chat and /api/chat say to each other. Shared by the browser and the server,
// so only types and plain constants here.
//
// The browser POSTs form data: a message (`ref`, `text`, `files`) or a tap (`tap`, `on`), plus
// `recipe`, the recipe on screen, so a "no buttermilk?" is about it. The answer streams back as
// one JSON `WebEvent` per line, as the assistant works.

export type WebEvent =
  | { op: "send"; ref: string; reply: Reply; replyTo?: string }
  | { op: "edit"; ref: string; reply: Reply }
  | { op: "removeButtons"; ref: string }
  | { op: "react"; ref: string; emoji: string }
  | { op: "typing" }
  /** Something broke on the server; the browser says so. */
  | { op: "failed" };

export const WEB_CHAT = {
  /** Messages and taps per person per hour. */
  perHour: 120,
  /** Photos in one message, like a Telegram album. */
  maxPhotos: 10,
  /** Vercel caps request bodies at 4.5 MB. */
  maxUploadBytes: 4_000_000,
  /** Messages kept in the browser. */
  keep: 80,
};

/** The recipe on a /recipes/<id> page, if that's where they are. */
export function recipeOnScreen(pathname: string | null): string | null {
  return pathname?.match(/^\/recipes\/([0-9a-f-]{36})(?:\/|$)/i)?.[1] ?? null;
}
