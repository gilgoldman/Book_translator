"use client";

import { useState, useTransition } from "react";
import { addPhoto, deleteRecipe, saveNotes } from "@/app/actions";
import { useT } from "@/lib/i18n/client";
import { downscaleImage } from "@/lib/image";
import { Icon } from "./icons";

type Props = {
  id: string;
  canEdit: boolean;
  notes: string | null;
  shareUrl: string;
};

/** Everything that isn't cooking lives behind one quiet toggle. */
export function RecipeExtras({ id, canEdit, notes, shareUrl }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(notes ?? "");
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState("");

  return (
    <section className="extras">
      <button className="extras-toggle" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="extras-body">
        <Icon name={open ? "check" : "plus"} /> {open ? t("extras.close") : t("extras.open")}
      </button>
      {open && (
        <div id="extras-body" className="extras-body">
          <label className="field">
            <span>{t("extras.notes")}</span>
            <textarea
              rows={3}
              dir="auto"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t("extras.notesPlaceholder")}
            />
          </label>
          <div className="button-row">
            <button
              className="btn"
              disabled={pending || draft === (notes ?? "")}
              onClick={() =>
                startTransition(async () => {
                  await saveNotes(id, draft);
                  setStatus(t("extras.notesSaved"));
                })
              }
            >
              {t("extras.saveNotes")}
            </button>
          </div>

          <label className="field">
            <span>{t("extras.photo")}</span>
            <input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const form = new FormData();
                form.set("photo", await downscaleImage(file));
                startTransition(async () => {
                  await addPhoto(id, form);
                  setStatus(t("extras.photoAdded"));
                });
                e.target.value = "";
              }}
            />
          </label>

          <div className="field">
            <span>{t("extras.share")}</span>
            <p className="muted">{t("extras.shareHelp")}</p>
            <div className="button-row">
              <button
                className="btn"
                onClick={async () => {
                  if (navigator.share) {
                    await navigator.share({ url: shareUrl }).catch(() => {});
                  } else {
                    await navigator.clipboard.writeText(shareUrl);
                    setStatus(t("extras.copied"));
                  }
                }}
              >
                {t("extras.shareButton")}
              </button>
            </div>
          </div>

          {canEdit && (
            <div className="button-row">
              <button
                className="btn danger"
                onClick={() =>
                  confirm(t("extras.deleteConfirm")) &&
                  startTransition(() => deleteRecipe(id))
                }
              >
                {t("extras.delete")}
              </button>
            </div>
          )}
          <p role="status">{pending ? t("common.saving") : status}</p>
        </div>
      )}
    </section>
  );
}
