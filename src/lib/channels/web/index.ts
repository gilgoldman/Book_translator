import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { onMessage, onTap, type Attachment, type Chat, type Incoming, type Person, type Tap } from "@/lib/assistant";
import { RECIPE_VIEWS } from "@/lib/assistant/chat";
import { PERSONA } from "@/lib/assistant/persona";
import type { DuplicateChoice } from "@/lib/dedupe";
import { LOCALE_CODES } from "@/lib/i18n/config";
import type { IncomingFile } from "@/lib/ingest";
import { WEB_CHAT, type WebEvent } from "./protocol";

// The website's chat: the same assistant as on Telegram, in a panel on every page. The browser
// side is src/components/chat-widget.tsx; they talk through /api/chat (see protocol.ts). Each
// request is one message or tap; the replies stream back as they're sent and edited.

const uuid = z.string().uuid();
const ref = z.string().regex(/^[\w-]{1,64}$/);
const choices = ["keep-original", "replace", "keep-both"] as const satisfies readonly DuplicateChoice[];
const locale = z.enum(LOCALE_CODES as [string, ...string[]]).nullable();

/** A button's action, as the browser sends it back: checked, since anyone can send anything. */
const actionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("view"), recipeId: uuid, view: z.enum(RECIPE_VIEWS), locale }),
  z.object({ kind: z.literal("open"), recipeId: uuid, locale }),
  z.object({ kind: z.literal("duplicate"), recipeId: uuid, choice: z.enum(choices), locale }),
  z.object({ kind: z.literal("saveVoice"), locale }),
]);

export type WebInput = { kind: "message"; msg: Incoming } | { kind: "tap"; tap: Tap };

/** The assistant's side of the chat: every reply becomes an event for the browser. */
export function webChat(emit: (event: WebEvent) => void, languageHint?: string): Chat {
  return {
    channel: "web",
    languageHint,
    appUrl: "",
    async send(reply, { replyTo } = {}) {
      const id = randomUUID();
      emit({ op: "send", ref: id, reply, ...(replyTo === undefined ? {} : { replyTo: String(replyTo) }) });
      return id;
    },
    async edit(id, reply) {
      emit({ op: "edit", ref: String(id), reply });
    },
    async removeButtons(id) {
      emit({ op: "removeButtons", ref: String(id) });
    },
    react: (id, mood) => emit({ op: "react", ref: String(id), emoji: PERSONA.reactions[mood] }),
    typing: () => emit({ op: "typing" }),
  };
}

/** Photos, or one voice note, from the form. Anything else is left out. */
async function attachmentOf(form: FormData): Promise<Attachment | undefined> {
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const audio = files.find((f) => f.type.startsWith("audio/"));
  const images = files.filter((f) => f.type.startsWith("image/")).slice(0, WEB_CHAT.maxPhotos);
  const picked = audio ? [audio] : images;
  if (!picked.length) return undefined;
  const loaded: IncomingFile[] = await Promise.all(
    picked.map(async (f) => ({ data: new Uint8Array(await f.arrayBuffer()), mediaType: f.type, name: f.name || "web" })),
  );
  return { kind: audio ? "audio" : "image", load: async () => loaded };
}

/** A message or a tap from the browser's form, or null if it isn't one. */
export async function parseWebInput(form: FormData): Promise<WebInput | null> {
  const field = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value : undefined;
  };
  const tap = field("tap");
  if (tap !== undefined) {
    let json: unknown;
    try {
      json = JSON.parse(tap);
    } catch {
      return null;
    }
    const action = actionSchema.safeParse(json);
    const on = ref.safeParse(field("on"));
    if (!action.success || !on.success) return null;
    const voiceRef = ref.safeParse(field("voiceRef"));
    const attachment = action.data.kind === "saveVoice" && voiceRef.success ? await attachmentOf(form) : undefined;
    return {
      kind: "tap",
      tap: {
        action: action.data as Tap["action"],
        on: on.data,
        voiceNote: attachment && voiceRef.success ? { ref: voiceRef.data, attachment } : null,
      },
    };
  }

  const id = ref.safeParse(field("ref"));
  if (!id.success) return null;
  const recipe = uuid.safeParse(field("recipe"));
  const text = field("text")?.trim() ?? "";
  const attachment = await attachmentOf(form);
  return {
    kind: "message",
    msg: {
      ref: id.data,
      // With photos or a voice note, what they typed goes along as the caption, as on Telegram.
      ...(attachment ? { caption: text || undefined, attachment } : { text }),
      repliedToRecipe: recipe.success ? recipe.data : null,
    },
  };
}

/** Hand one message or tap to the assistant, with its replies going to `emit`. */
export async function handleWebInput(person: Person, input: WebInput, emit: (event: WebEvent) => void, languageHint?: string) {
  const chat = webChat(emit, languageHint);
  if (input.kind === "tap") return onTap(chat, person, input.tap);
  return onMessage(chat, person, input.msg);
}
