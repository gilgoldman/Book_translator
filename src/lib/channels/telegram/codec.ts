import { RECIPE_VIEWS, type Action, type Button, type RecipeView } from "@/lib/assistant/chat";
import { isLocale } from "@/lib/i18n/config";
import type { TgMessage } from "./api";

// Between Telegram's shapes and the assistant's: buttons, sign-ins and attachments.

const localeOf = (code: string | undefined) => (isLocale(code) ? code : null);
const lang = (locale: string | null) => (locale ? `:${locale}` : "");

const DUP_CODES = { o: "keep-original", r: "replace", b: "keep-both" } as const;
const DUP_LETTERS = { "keep-original": "o", replace: "r", "keep-both": "b" } as const;

/**
 * A button's action as callback data (64 bytes at most). The formats are fixed: buttons already
 * sent keep them. Those sent before languages were added have no <lang>, and still work.
 *   v:<id>:<view>[:<lang>]      show the recipe on this message in another view
 *   o:<id>[:<lang>]             open a recipe from a list as a new message
 *   d:<id>:<o|r|b>[:<lang>]     keep original / replace / keep both
 *   s[:<lang>]                  save the voice note this message answered as a recipe
 */
export function encodeAction(a: Action): string {
  switch (a.kind) {
    case "view":
      return `v:${a.recipeId}:${a.view}${lang(a.locale)}`;
    case "open":
      return `o:${a.recipeId}${lang(a.locale)}`;
    case "duplicate":
      return `d:${a.recipeId}:${DUP_LETTERS[a.choice]}${lang(a.locale)}`;
    case "saveVoice":
      return `s${lang(a.locale)}`;
  }
}

export function decodeAction(data: string): Action | null {
  const open = data.match(/^o:([0-9a-f-]{36})(?::(\w+))?$/);
  if (open) return { kind: "open", recipeId: open[1], locale: localeOf(open[2]) };
  const view = data.match(/^v:([0-9a-f-]{36}):(\w+)(?::(\w+))?$/);
  if (view) {
    if (!(RECIPE_VIEWS as readonly string[]).includes(view[2])) return null;
    return { kind: "view", recipeId: view[1], view: view[2] as RecipeView, locale: localeOf(view[3]) };
  }
  const dup = data.match(/^d:([0-9a-f-]{36}):([orb])(?::(\w+))?$/);
  if (dup) {
    return { kind: "duplicate", recipeId: dup[1], choice: DUP_CODES[dup[2] as keyof typeof DUP_CODES], locale: localeOf(dup[3]) };
  }
  const save = data.match(/^s(?::(\w+))?$/);
  if (save) return { kind: "saveVoice", locale: localeOf(save[1]) };
  return null;
}

/** Button labels are cut short; never in the middle of an emoji. */
const buttonText = (s: string, max = 60) => [...s].slice(0, max).join("");

/** The assistant's buttons as a Telegram inline keyboard. */
export function inlineKeyboard(rows: Button[][]) {
  return {
    inline_keyboard: rows.map((row) =>
      row.map((b) =>
        "url" in b
          ? { text: buttonText(b.label), url: b.url }
          : { text: buttonText(b.label), callback_data: encodeAction(b.action) },
      ),
    ),
  };
}

/** The recipe a bot message shows, from its view buttons; null for any other message. */
export function recipeIdOf(markup: { inline_keyboard?: { callback_data?: string }[][] } | undefined): string | null {
  for (const row of markup?.inline_keyboard ?? []) {
    for (const button of row) {
      const action = button.callback_data ? decodeAction(button.callback_data) : null;
      if (action?.kind === "view") return action.recipeId;
    }
  }
  return null;
}

/** "/login username password": the password may have spaces. */
export function parseLogin(text: string): { username: string; password: string } | null {
  const m = text.trim().match(/^\/login(?:@\w+)?\s+(\S+)\s+(.+)$/s);
  return m ? { username: m[1], password: m[2].trim() } : null;
}

export type TgMedia = { kind: "image" | "audio"; fileId: string; mediaType: string };

/** The photo (largest size), voice note, audio file, or image or audio document in a message. */
export function pickMedia(msg: TgMessage): TgMedia | null {
  if (msg.photo?.length) {
    const largest = msg.photo[msg.photo.length - 1];
    return { kind: "image", fileId: largest.file_id, mediaType: "image/jpeg" };
  }
  if (msg.voice) return { kind: "audio", fileId: msg.voice.file_id, mediaType: msg.voice.mime_type ?? "audio/ogg" };
  if (msg.audio) return { kind: "audio", fileId: msg.audio.file_id, mediaType: msg.audio.mime_type ?? "audio/mpeg" };
  const doc = msg.document;
  if (doc?.mime_type?.startsWith("image/")) return { kind: "image", fileId: doc.file_id, mediaType: doc.mime_type };
  if (doc?.mime_type?.startsWith("audio/")) return { kind: "audio", fileId: doc.file_id, mediaType: doc.mime_type };
  return null;
}
