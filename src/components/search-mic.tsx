"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import { CHAT_SEND_EVENT, type ChatSendDetail } from "./chat-widget";
import { Icon } from "./icons";
import { MicHelp } from "./mic-help";
import { useRecorder } from "./use-recorder";

/**
 * Search out loud: "what can I make with leeks?". The assistant works out the search, the same
 * way it hears voice notes on Telegram; a recipe read aloud goes to the chat to be saved.
 */
export function SearchMic() {
  const t = useT();
  const router = useRouter();
  const [hearing, setHearing] = useState(false);
  const [failed, setFailed] = useState(false);

  async function hear(file: File) {
    setHearing(true);
    try {
      const form = new FormData();
      form.set("audio", file);
      const res = await fetch("/api/voice-search", { method: "POST", body: form });
      const heard = res.ok ? ((await res.json()) as { kind: "question" | "recipe"; query: string }) : null;
      if (heard?.kind === "recipe") {
        window.dispatchEvent(new CustomEvent<ChatSendDetail>(CHAT_SEND_EVENT, { detail: { files: [file] } }));
      } else if (heard?.query) {
        router.push(`/?q=${encodeURIComponent(heard.query)}`);
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    } finally {
      setHearing(false);
    }
  }
  const recorder = useRecorder((file) => void hear(file));

  const status = recorder.recording
    ? t("home.listening")
    : hearing
      ? t("home.hearing")
      : failed
        ? t("home.voiceFailed")
        : null;

  return (
    <>
      <button
        type="button"
        className={`btn search-mic${recorder.recording ? " danger" : ""}`}
        aria-pressed={recorder.recording}
        disabled={hearing}
        onClick={() => {
          setFailed(false);
          recorder.toggle();
        }}
      >
        <Icon name={recorder.recording ? "stop" : "mic"} /> {t("home.speak")}
      </button>
      {status && (
        <p className="search-status" role="status">
          {status}
        </p>
      )}
      {recorder.problem && !hearing && (
        <MicHelp
          className="search-status"
          problem={recorder.problem}
          onFile={(file) => {
            recorder.clearProblem();
            void hear(file);
          }}
        />
      )}
    </>
  );
}
