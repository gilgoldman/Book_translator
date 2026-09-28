import type { DuplicateChoice } from "@/lib/dedupe";
import type { Locale } from "@/lib/i18n/config";
import type { IncomingFile } from "@/lib/ingest";
import type { PERSONA } from "./persona";

// What a channel (Telegram today; WhatsApp or a web chat one day) and the assistant say to each
// other. A channel turns its own messages into these and these into its own messages; the
// assistant never sees a channel's API. Telegram's side is src/lib/channels/telegram.

/** A message in the conversation, as the channel knows it (Telegram's message_id, say). */
export type MessageRef = string | number;

export const RECIPE_VIEWS = ["effective", "classic", "ratios", "source"] as const;
export type RecipeView = (typeof RECIPE_VIEWS)[number];

/**
 * What a button does. Each carries the language it was written in, so tapping it answers in
 * that language too (null for buttons from before languages).
 */
export type Action =
  /** Show the recipe on this message in another view. */
  | { kind: "view"; recipeId: string; view: RecipeView; locale: Locale | null }
  /** Open a recipe from a list, as a new message. */
  | { kind: "open"; recipeId: string; locale: Locale | null }
  /** Keep original / replace / keep both, for a new recipe that looks like one in the book. */
  | { kind: "duplicate"; recipeId: string; choice: DuplicateChoice; locale: Locale | null }
  /** A voice note was taken as a question; save it as a recipe after all. */
  | { kind: "saveVoice"; locale: Locale | null };

export type Button = { label: string; action: Action } | { label: string; url: string };

/** A reply: rich text (<b>, <i>, <code>, the rest HTML-escaped) and rows of buttons. */
export type Reply = { text: string; buttons?: Button[][] };

/** How the assistant takes what they sent. Channels with reactions show PERSONA.reactions. */
export type Mood = keyof typeof PERSONA.reactions;

/** The signed-in person the channel is talking to. */
export type Person = { id: string; locale: string | null; isAdmin: boolean };

/** Photos or a voice note, downloaded only when needed. */
export type Attachment = { kind: "image" | "audio"; load: () => Promise<IncomingFile[]> };

/** Something they sent. */
export type Incoming = {
  ref: MessageRef;
  text?: string;
  caption?: string;
  attachment?: Attachment;
  /** The recipe shown on the message they replied to, if any: a "no buttermilk?" is about it. */
  repliedToRecipe?: string | null;
};

/** A button they tapped. */
export type Tap = {
  action: Action;
  /** The message the button is on. */
  on: MessageRef;
  /** For "save it as a recipe": the voice note that message answered, if the channel finds it. */
  voiceNote?: { ref: MessageRef; caption?: string; attachment: Attachment } | null;
};

/** What the assistant asks of a channel, for one conversation. */
export type Chat = {
  /** The channel's name in logs, e.g. "telegram". */
  channel: string;
  /** The channel's guess at their language, e.g. the language their Telegram is set to. */
  languageHint?: string;
  send(reply: Reply, options?: { replyTo?: MessageRef }): Promise<MessageRef>;
  /** Replace a reply sent earlier. A channel that can't edit sends it anew. */
  edit(ref: MessageRef, reply: Reply): Promise<void>;
  /** Take the buttons off a reply sent earlier. Best-effort. */
  removeButtons(ref: MessageRef): Promise<void>;
  /** Show how the assistant takes their message. Best-effort, returns at once. */
  react(ref: MessageRef, mood: Mood): void;
  /** "typing…" for a few seconds. Best-effort, returns at once. */
  typing(): void;
};
