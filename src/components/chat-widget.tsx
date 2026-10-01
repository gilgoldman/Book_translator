"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Button, Reply } from "@/lib/assistant/chat";
import { recipeOnScreen, WEB_CHAT, type WebEvent } from "@/lib/channels/web/protocol";
import { useT } from "@/lib/i18n/client";
import { downscaleImage } from "@/lib/image";
import { Icon } from "./icons";
import { RichText } from "./rich-text";
import { useRecorder } from "./use-recorder";

// The chat panel on every page: the same assistant as the Telegram bot (src/lib/assistant),
// through /api/chat (src/lib/channels/web). Ask in writing or out loud, or send a recipe to save.
// The conversation is kept in this browser only.

type Msg = {
  id: string;
  from: "me" | "bot";
  /** Rich text for the assistant (see rich-text.tsx), plain for them. */
  text: string;
  /** What they attached: "🎙 Voice note", "📷 2 photos". */
  note?: string;
  buttons?: Button[][];
  reaction?: string;
  /** The message this answers, e.g. the voice note an "I heard: …" is about. */
  replyTo?: string;
};

/** Asks the chat to send something from elsewhere on the page (the search bar's microphone). */
export const CHAT_SEND_EVENT = "cookbook:chat-send";
export type ChatSendDetail = { files: File[] };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function load(key: string): Msg[] {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function save(key: string, messages: Msg[]) {
  try {
    if (messages.length) localStorage.setItem(key, JSON.stringify(messages.slice(-WEB_CHAT.keep)));
    else localStorage.removeItem(key);
  } catch {}
}

/** A same-site link ("/recipes/…") is followed in the app; anything else opens a new tab. */
function internalPath(url: string) {
  try {
    const u = new URL(url, window.location.origin);
    return u.origin === window.location.origin ? u.pathname + u.search : null;
  } catch {
    return null;
  }
}

export function ChatWidget({ userId }: { userId: string }) {
  const t = useT();
  const pathname = usePathname();
  const storageKey = `cookbook.chat.${userId}`;
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(0);
  const [text, setText] = useState("");
  // Voice notes stay in memory, for "it's a recipe, save it".
  const voiceNotes = useRef(new Map<string, File>());
  const log = useRef<HTMLOListElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const fab = useRef<HTMLButtonElement>(null);
  const recipe = recipeOnScreen(pathname);

  const recorder = useRecorder((file) => void sendMessage({ files: [file] }));

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- read what this browser kept */
    setMessages(load(storageKey));
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [storageKey]);

  useEffect(() => {
    if (loaded) save(storageKey, messages);
  }, [loaded, storageKey, messages]);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [messages, busy, open]);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  // The search bar's microphone hands over recipes read aloud.
  useEffect(() => {
    const onSend = (e: Event) => {
      setOpen(true);
      void sendMessage({ files: (e as CustomEvent<ChatSendDetail>).detail.files });
    };
    window.addEventListener(CHAT_SEND_EVENT, onSend);
    return () => window.removeEventListener(CHAT_SEND_EVENT, onSend);
  });

  const add = (msg: Msg) => setMessages((list) => [...list, msg]);
  const change = (id: string, f: (m: Msg) => Msg) => setMessages((list) => list.map((m) => (m.id === id ? f(m) : m)));
  const say = (words: string) => add({ id: crypto.randomUUID(), from: "bot", text: esc(words) });

  function apply(event: WebEvent) {
    const reply = (r: Reply) => ({ text: r.text, buttons: r.buttons });
    switch (event.op) {
      case "send":
        return add({ id: event.ref, from: "bot", ...reply(event.reply), replyTo: event.replyTo });
      case "edit":
        return setMessages((list) =>
          list.some((m) => m.id === event.ref)
            ? list.map((m) => (m.id === event.ref ? { ...m, ...reply(event.reply) } : m))
            : [...list, { id: event.ref, from: "bot", ...reply(event.reply) }],
        );
      case "removeButtons":
        return change(event.ref, (m) => ({ ...m, buttons: undefined }));
      case "react":
        return change(event.ref, (m) => ({ ...m, reaction: event.emoji }));
      case "failed":
        return say(t("chat.error"));
    }
  }

  /** POST to the assistant and apply its replies as they stream in. */
  async function run(form: FormData) {
    if (recipe) form.set("recipe", recipe);
    let size = 0;
    for (const value of form.values()) if (value instanceof File) size += value.size;
    if (size > WEB_CHAT.maxUploadBytes) return say(t("chat.tooBig"));

    setBusy((n) => n + 1);
    try {
      const res = await fetch("/api/chat", { method: "POST", body: form });
      if (res.status === 429) return say(t("chat.slowDown"));
      if (!res.ok || !res.body) return say(t("chat.error"));
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) if (line.trim()) apply(JSON.parse(line) as WebEvent);
      }
    } catch {
      say(t("chat.error"));
    } finally {
      setBusy((n) => n - 1);
    }
  }

  async function sendMessage({ text: typed = "", files = [] }: { text?: string; files?: File[] }) {
    const words = typed.trim();
    if (!words && !files.length) return;
    const id = crypto.randomUUID();
    const audio = files.find((f) => f.type.startsWith("audio/"));
    const photos = audio ? [] : await Promise.all(files.slice(0, WEB_CHAT.maxPhotos).map((f) => downscaleImage(f)));
    if (audio) voiceNotes.current.set(id, audio);
    add({
      id,
      from: "me",
      text: words,
      note: audio ? t("chat.voiceNote") : photos.length ? t("chat.photosSent", { n: photos.length }) : undefined,
    });
    const form = new FormData();
    form.set("ref", id);
    form.set("text", words);
    for (const f of audio ? [audio] : photos) form.append("files", f);
    await run(form);
  }

  function tap(msg: Msg, button: Button) {
    if (!("action" in button)) return;
    const form = new FormData();
    form.set("tap", JSON.stringify(button.action));
    form.set("on", msg.id);
    if (button.action.kind === "saveVoice" && msg.replyTo) {
      const voice = voiceNotes.current.get(msg.replyTo);
      if (voice) {
        form.set("voiceRef", msg.replyTo);
        form.append("files", voice);
      }
    }
    void run(form);
  }

  function submit() {
    const words = text;
    setText("");
    void sendMessage({ text: words });
  }

  function close() {
    setOpen(false);
    // The button is hidden while the panel is open; focus it once it's back.
    requestAnimationFrame(() => fab.current?.focus());
  }

  const examples = t("home.examples").split("|");

  return (
    <>
      <button
        ref={fab}
        type="button"
        className="chat-fab"
        aria-expanded={open}
        aria-controls="chat-panel"
        onClick={() => (open ? close() : setOpen(true))}
        hidden={open}
      >
        <Icon name="chat" /> {t("chat.button")}
      </button>
      {open && (
        <section
          id="chat-panel"
          className="chat-panel"
          role="dialog"
          aria-labelledby="chat-title"
          onKeyDown={(e) => e.key === "Escape" && close()}
        >
          <header className="chat-head">
            <h2 id="chat-title">
              <Icon name="chat" /> {t("chat.title")}
            </h2>
            {messages.length > 0 && (
              <button
                type="button"
                className="quiet"
                onClick={() => {
                  setMessages([]);
                  voiceNotes.current.clear();
                }}
              >
                {t("chat.clear")}
              </button>
            )}
            <button type="button" className="btn chat-close" onClick={close} aria-label={t("chat.close")}>
              <Icon name="close" />
            </button>
          </header>

          <ol className="chat-log" ref={log} aria-live="polite">
            {messages.length === 0 && (
              <li className="chat-intro">
                <p>{t("chat.intro")}</p>
                <p className="chat-examples">
                  {examples.map((example) => (
                    <button key={example} type="button" className="chip" onClick={() => void sendMessage({ text: example })}>
                      {example}
                    </button>
                  ))}
                </p>
              </li>
            )}
            {messages.map((m) => (
              <li key={m.id} className={`bubble ${m.from}`}>
                <div className="bubble-text" dir="auto">
                  {m.note && <span className="bubble-note">{m.note}</span>}
                  {m.from === "bot" ? <RichText text={m.text} /> : m.text}
                </div>
                {m.reaction && (
                  <span className="bubble-reaction" aria-hidden>
                    {m.reaction}
                  </span>
                )}
                {m.buttons?.map((row, i) => (
                  <div key={i} className="bubble-buttons">
                    {row.map((b) =>
                      "action" in b ? (
                        <button key={b.label} type="button" className="btn" onClick={() => tap(m, b)} dir="auto">
                          {b.label}
                        </button>
                      ) : (
                        <ChatLink key={b.label} url={b.url} label={b.label} onFollow={() => window.innerWidth < 700 && setOpen(false)} />
                      ),
                    )}
                  </div>
                ))}
              </li>
            ))}
            {busy > 0 && (
              <li className="bubble bot typing" role="status">
                <span className="dots" aria-hidden>
                  <span />
                  <span />
                  <span />
                </span>
                <span className="visually-hidden">{t("chat.thinking")}</span>
              </li>
            )}
          </ol>

          {recipe && messages.length === 0 && <p className="chat-context">{t("chat.onRecipe")}</p>}
          {recorder.recording && (
            <p className="chat-context recording" role="status">
              {t("chat.recording")}
            </p>
          )}
          {recorder.failed && (
            <p className="chat-context" role="alert">
              {t("chat.noMic")}
            </p>
          )}

          <form
            className="chat-compose"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <textarea
              ref={input}
              rows={1}
              value={text}
              dir="auto"
              aria-label={t("chat.placeholder")}
              placeholder={t("chat.placeholder")}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            <div className="chat-tools">
              <label className="btn" title={t("chat.photos")}>
                <Icon name="camera" />
                <span className="visually-hidden">{t("chat.photos")}</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) => {
                    const files = [...(e.target.files ?? [])];
                    e.target.value = "";
                    const caption = text;
                    setText("");
                    void sendMessage({ text: caption, files });
                  }}
                />
              </label>
              <button
                type="button"
                className={`btn${recorder.recording ? " danger" : ""}`}
                aria-pressed={recorder.recording}
                onClick={recorder.toggle}
                title={recorder.recording ? t("chat.stop") : t("chat.record")}
              >
                <Icon name={recorder.recording ? "stop" : "mic"} />
                <span className="visually-hidden">{recorder.recording ? t("chat.stop") : t("chat.record")}</span>
              </button>
              <button className="primary" disabled={!text.trim()}>
                <Icon name="send" /> {t("chat.send")}
              </button>
            </div>
          </form>
        </section>
      )}
    </>
  );
}

function ChatLink({ url, label, onFollow }: { url: string; label: string; onFollow: () => void }) {
  const path = internalPath(url);
  return path ? (
    <Link href={path} className="btn" onClick={onFollow} dir="auto">
      {label}
    </Link>
  ) : (
    <a href={url} className="btn" target="_blank" rel="noreferrer" dir="auto">
      {label}
    </a>
  );
}
