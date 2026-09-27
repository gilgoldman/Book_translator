"use client";

import { useState, useTransition } from "react";
import { addPhoto, deleteRecipe, saveNotes, saveTags } from "@/app/actions";
import { COURSES, CUISINES, DIETS, SEASONS } from "@/lib/recipe-types";
import { titleCase } from "@/lib/format";
import { downscaleImage } from "@/lib/image";

type Props = {
  id: string;
  notes: string | null;
  shareUrl: string;
  tags: { cuisine: string; course: string; season: string; diet: string[] };
};

/** Everything that isn't cooking lives behind one quiet toggle. */
export function RecipeExtras({ id, notes, shareUrl, tags }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(notes ?? "");
  const [t, setT] = useState(tags);
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  return (
    <section className="extras">
      <button className="extras-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? "− less" : "+ notes, photos, tags, share"}
      </button>
      {open && (
        <div className="extras-body">
          <label className="field">
            <span>Notes</span>
            <textarea
              rows={3}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => draft !== (notes ?? "") && startTransition(() => saveNotes(id, draft))}
              placeholder="Less sugar next time…"
            />
          </label>

          <label className="field">
            <span>Add a photo</span>
            <input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const form = new FormData();
                form.set("photo", await downscaleImage(file));
                startTransition(() => addPhoto(id, form));
                e.target.value = "";
              }}
            />
          </label>

          <div className="field tag-fields">
            <span>Tags</span>
            <select value={t.cuisine} onChange={(e) => setT({ ...t, cuisine: e.target.value })}>
              {CUISINES.map((c) => (
                <option key={c} value={c}>{titleCase(c)}</option>
              ))}
            </select>
            <select value={t.course} onChange={(e) => setT({ ...t, course: e.target.value })}>
              {COURSES.map((c) => (
                <option key={c} value={c}>{titleCase(c)}</option>
              ))}
            </select>
            <select value={t.season} onChange={(e) => setT({ ...t, season: e.target.value })}>
              {SEASONS.map((c) => (
                <option key={c} value={c}>{titleCase(c)}</option>
              ))}
            </select>
            <div className="diet-checks">
              {DIETS.map((d) => (
                <label key={d}>
                  <input
                    type="checkbox"
                    checked={t.diet.includes(d)}
                    onChange={(e) =>
                      setT({ ...t, diet: e.target.checked ? [...t.diet, d] : t.diet.filter((x) => x !== d) })
                    }
                  />
                  {d}
                </label>
              ))}
            </div>
            <button className="quiet" onClick={() => startTransition(() => saveTags(id, t))}>
              save tags
            </button>
          </div>

          <div className="field">
            <span>Share</span>
            <button
              className="quiet"
              onClick={async () => {
                if (navigator.share) {
                  await navigator.share({ url: shareUrl }).catch(() => {});
                } else {
                  await navigator.clipboard.writeText(shareUrl);
                  setCopied(true);
                }
              }}
            >
              {copied ? "link copied" : "share a read-only link"}
            </button>
          </div>

          <button
            className="quiet danger"
            onClick={() => confirm("Delete this recipe?") && startTransition(() => deleteRecipe(id))}
          >
            delete recipe
          </button>
          {pending && <p className="muted">saving…</p>}
        </div>
      )}
    </section>
  );
}
