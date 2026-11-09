"use client";

import { useState, useTransition } from "react";
import { deleteRecipe } from "@/app/actions";
import { useT } from "@/lib/i18n/client";
import { Icon } from "./icons";

type Props = {
  id: string;
  canEdit: boolean;
  shareUrl: string;
};

/** Everything that isn't cooking lives behind one quiet toggle. */
export function RecipeExtras({ id, canEdit, shareUrl }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState("");

  return (
    <section className="extras">
      <button className="extras-toggle" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="extras-body">
        <Icon name={open ? "check" : "plus"} /> {open ? t("extras.close") : t("extras.open")}
      </button>
      {open && (
        <div id="extras-body" className="extras-body">
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
