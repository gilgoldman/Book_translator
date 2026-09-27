"use client";

import { useActionState, useMemo, useRef, useState, startTransition } from "react";
import { importRecipe, type FormState } from "@/app/actions";
import { useT } from "@/lib/i18n/client";
import { downscaleImage } from "@/lib/image";

export function ImportForm() {
  const t = useT();
  const [state, action, pending] = useActionState<FormState, FormData>(importRecipe, undefined);
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [voice, setVoice] = useState<File | null>(null);
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const voiceUrl = useMemo(() => (voice ? URL.createObjectURL(voice) : null), [voice]);

  async function toggleRecording() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const type = rec.mimeType.split(";")[0] || "audio/webm";
      setVoice(new File(chunks, `voice.${type.split("/")[1]}`, { type }));
      setRecording(false);
    };
    rec.start();
    recorder.current = rec;
    setRecording(true);
    setPhotos([]);
  }

  async function submit() {
    const form = new FormData();
    form.set("text", text);
    if (voice) form.append("files", voice);
    else for (const p of photos) form.append("files", await downscaleImage(p));
    startTransition(() => action(form));
  }

  const ready = text.trim() || photos.length || voice;

  return (
    <form
      className="import"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label className="field" htmlFor="import-text">
        <span>{t("import.label")}</span>
        <span className="help">{t("import.help")}</span>
      </label>
      <textarea
        id="import-text"
        rows={6}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t("import.placeholder")}
        dir="auto"
        disabled={pending}
      />

      <div className="button-row">
        <label className="btn">
          {photos.length ? t("import.photos", { n: photos.length }) : t("import.choose")}
          <input
            type="file"
            accept="image/*,audio/*"
            multiple
            hidden
            disabled={pending}
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              const audio = files.find((f) => f.type.startsWith("audio/"));
              if (audio) {
                setVoice(audio);
                setPhotos([]);
              } else {
                setPhotos(files);
                setVoice(null);
              }
            }}
          />
        </label>
        <button
          type="button"
          className={`btn${recording ? " danger" : ""}`}
          onClick={toggleRecording}
          disabled={pending}
          aria-pressed={recording}
        >
          {recording ? t("import.stop") : voice ? t("import.recordAgain") : t("import.record")}
        </button>
        {(photos.length > 0 || voice) && !pending && (
          <button type="button" className="btn" onClick={() => (setPhotos([]), setVoice(null))}>
            {t("import.clear")}
          </button>
        )}
      </div>
      {voiceUrl && <audio controls src={voiceUrl} />}

      <button className="primary" disabled={!ready || pending || recording}>
        {pending ? t("import.reading") : t("import.submit")}
      </button>
      {pending && <p role="status">{t("import.status")}</p>}
      {state?.error && <p className="error" role="alert">{state.error}</p>}
    </form>
  );
}
