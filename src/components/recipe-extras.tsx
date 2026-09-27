"use client";

import { useState, useTransition } from "react";
import { addPhoto, deleteRecipe, saveNotes } from "@/app/actions";
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
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(notes ?? "");
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState("");

  return (
    <section className="extras">
      <button className="extras-toggle" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="extras-body">
        <Icon name={open ? "check" : "plus"} /> {open ? "Close" : "Notes, photos and sharing"}
      </button>
      {open && (
        <div id="extras-body" className="extras-body">
          <label className="field">
            <span>Your notes</span>
            <textarea
              rows={3}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Less sugar next time…"
            />
          </label>
          <div className="button-row">
            <button
              className="btn"
              disabled={pending || draft === (notes ?? "")}
              onClick={() =>
                startTransition(async () => {
                  await saveNotes(id, draft);
                  setStatus("Notes saved.");
                })
              }
            >
              Save notes
            </button>
          </div>

          <label className="field">
            <span>Add a photo of your dish</span>
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
                  setStatus("Photo added.");
                });
                e.target.value = "";
              }}
            />
          </label>

          <div className="field">
            <span>Share with a friend</span>
            <p className="muted">They&apos;ll see a read-only page, no account needed.</p>
            <div className="button-row">
              <button
                className="btn"
                onClick={async () => {
                  if (navigator.share) {
                    await navigator.share({ url: shareUrl }).catch(() => {});
                  } else {
                    await navigator.clipboard.writeText(shareUrl);
                    setStatus("Link copied.");
                  }
                }}
              >
                Share link
              </button>
            </div>
          </div>

          {canEdit && (
            <div className="button-row">
              <button
                className="btn danger"
                onClick={() =>
                  confirm("Delete this recipe for everyone? This can't be undone.") &&
                  startTransition(() => deleteRecipe(id))
                }
              >
                Delete recipe
              </button>
            </div>
          )}
          <p role="status">{pending ? "Saving…" : status}</p>
        </div>
      )}
    </section>
  );
}
