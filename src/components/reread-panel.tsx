"use client";

import { useState, useTransition } from "react";
import { applyRereadAction, previewReread } from "@/app/actions";
import { useT } from "@/lib/i18n/client";
import { isUnchanged, type RecipeDiff } from "@/lib/recipe-changes";

const DETAIL_LABELS = {
  title: "edit.title",
  servings: "edit.makes",
  prepMinutes: "edit.prep",
  cookMinutes: "edit.cook",
  totalMinutes: "edit.total",
} as const;

/**
 * "Read the original again": the original is read afresh, what would change is shown, and only
 * "Use the new reading" saves it.
 */
export function RereadPanel({ id, dir }: { id: string; dir: "ltr" | "rtl" }) {
  const t = useT();
  const [pending, start] = useTransition();
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<{ proposal: string; diff: RecipeDiff } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const read = () =>
    start(async () => {
      setError(null);
      setPreview(null);
      const result = await previewReread(id);
      if ("error" in result) setError(result.error);
      else setPreview(result);
    });

  const use = () =>
    start(async () => {
      if (!preview) return;
      setSaving(true);
      const result = await applyRereadAction(id, preview.proposal);
      // Success redirects to the recipe; only failures come back.
      setSaving(false);
      if (result?.error) setError(result.error);
    });

  const diff = preview?.diff;
  const same = diff && isUnchanged(diff);

  return (
    <section className="card reread" aria-labelledby="reread-title">
      <h2 id="reread-title">{t("edit.rereadTitle")}</h2>
      <p className="help">{t("edit.rereadHelp")}</p>

      {!preview && (
        <button type="button" className="btn" onClick={read} disabled={pending}>
          {t("edit.rereadButton")}
        </button>
      )}
      {pending && !saving && <p role="status">{t("edit.rereadReading")}</p>}

      {diff && same && <p role="status">{t("edit.rereadSame")}</p>}
      {diff && !same && (
        <div className="reread-diff" dir={dir}>
          <p>
            <strong>{t("edit.rereadChanges")}</strong>
          </p>
          {diff.details.map((d) => (
            <Lines key={d.field} title={t(DETAIL_LABELS[d.field])} removed={[String(d.before ?? "—")]} added={[String(d.after ?? "—")]} />
          ))}
          <Lines title={t("edit.ingredients")} {...diff.ingredients} />
          <Lines title={t("edit.method")} {...diff.steps} />
        </div>
      )}

      {preview && (
        <div className="button-row">
          {!same && (
            <button type="button" className="btn btn-primary" onClick={use} disabled={pending}>
              {saving ? t("edit.rereadSaving") : t("edit.rereadUse")}
            </button>
          )}
          <button type="button" className="btn" onClick={() => setPreview(null)} disabled={pending}>
            {t("edit.rereadKeep")}
          </button>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function Lines({ title, removed, added }: { title: string; removed: string[]; added: string[] }) {
  if (!removed.length && !added.length) return null;
  return (
    <div className="diff-group">
      <h3>{title}</h3>
      <ul>
        {removed.map((line, i) => (
          <li key={`-${i}`} className="diff-removed">
            <span aria-hidden>− </span>
            <del>{line}</del>
          </li>
        ))}
        {added.map((line, i) => (
          <li key={`+${i}`} className="diff-added">
            <span aria-hidden>+ </span>
            <ins>{line}</ins>
          </li>
        ))}
      </ul>
    </div>
  );
}
