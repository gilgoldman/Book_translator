"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { addNote, deleteNote, type FormState } from "@/app/actions";
import { useT } from "@/lib/i18n/client";
import { downscaleImage } from "@/lib/image";
import { MAX_NOTE_PHOTOS, MAX_UPLOAD_BYTES } from "@/lib/photos";
import { Avatar } from "./avatar";
import { Carousel } from "./carousel";
import { Icon } from "./icons";

export type NoteView = {
  id: string;
  text: string;
  photos: string[];
  date: string;
  by: { name: string; avatar: string | null } | null;
  canDelete: boolean;
};

/** Notes people leave on a recipe, each with photos of how theirs turned out. */
export function RecipeNotes({ recipeId, notes }: { recipeId: string; notes: NoteView[] }) {
  const t = useT();
  return (
    <section className="r-notes" aria-labelledby="notes-title">
      <h2 id="notes-title">{t("notes.title")}</h2>
      {notes.length > 0 && (
        <ol className="note-list">
          {notes.map((n) => (
            <Note key={n.id} note={n} />
          ))}
        </ol>
      )}
      <NoteComposer recipeId={recipeId} />
    </section>
  );
}

function Note({ note }: { note: NoteView }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const name = note.by?.name ?? t("notes.someone");
  return (
    <li className="note">
      <div className="note-head">
        <Avatar name={name} src={note.by?.avatar} />
        <b>{name}</b>
        <span className="muted">{note.date}</span>
        {note.canDelete && (
          <button
            type="button"
            className="note-delete"
            disabled={pending}
            aria-label={t("notes.delete")}
            title={t("notes.delete")}
            onClick={() => confirm(t("notes.deleteConfirm")) && startTransition(() => deleteNote(note.id))}
          >
            <Icon name="close" />
          </button>
        )}
      </div>
      {note.text && (
        <p className="note-text" dir="auto">
          {note.text}
        </p>
      )}
      <Carousel photos={note.photos} label={t("notes.photosOf", { name })} className="note-photos" />
    </li>
  );
}

function NoteComposer({ recipeId }: { recipeId: string }) {
  const t = useT();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [state, setState] = useState<FormState>(undefined);
  const [pending, startTransition] = useTransition();
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  function post() {
    startTransition(async () => {
      // Smaller than for importing: these are for looking at, not reading.
      const photos = await Promise.all(files.map((f) => downscaleImage(f, 1600, 0.8)));
      if (photos.reduce((sum, p) => sum + p.size, 0) > MAX_UPLOAD_BYTES) {
        setState({ error: t("notes.tooLarge") });
        return;
      }
      const form = new FormData();
      form.set("text", text);
      for (const p of photos) form.append("photos", p);
      const result = await addNote(recipeId, form).catch(() => ({ error: t("notes.failed") }));
      setState(result);
      if (!result?.error) {
        setText("");
        setFiles([]);
      }
    });
  }

  return (
    <form
      className="note-composer"
      onSubmit={(e) => {
        e.preventDefault();
        post();
      }}
    >
      <label className="field">
        <span>{t("notes.add")}</span>
        <textarea
          rows={3}
          dir="auto"
          maxLength={2000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("notes.placeholder")}
          disabled={pending}
        />
      </label>
      {previews.length > 0 && (
        <ul className="note-previews">
          {previews.map((src, i) => (
            <li key={src}>
              <img src={src} alt="" />
              <button
                type="button"
                aria-label={t("notes.removePhoto", { n: i + 1 })}
                onClick={() => setFiles(files.filter((_, k) => k !== i))}
                disabled={pending}
              >
                <Icon name="close" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="button-row">
        <label className={`btn${files.length >= MAX_NOTE_PHOTOS ? " disabled" : ""}`}>
          <Icon name="camera" /> {t("notes.addPhotos")}
          <input
            type="file"
            accept="image/*"
            multiple
            hidden
            disabled={pending || files.length >= MAX_NOTE_PHOTOS}
            onChange={(e) => {
              setFiles([...files, ...(e.target.files ?? [])].slice(0, MAX_NOTE_PHOTOS));
              e.target.value = "";
            }}
          />
        </label>
        <button className="btn btn-primary" disabled={pending || (!text.trim() && !files.length)}>
          {pending ? t("common.saving") : t("notes.post")}
        </button>
      </div>
      <p className="muted">{t("notes.photoLimit", { n: MAX_NOTE_PHOTOS })}</p>
      <p role="status" className={state?.error ? "error" : undefined}>
        {state?.error ?? state?.ok ?? ""}
      </p>
    </form>
  );
}
