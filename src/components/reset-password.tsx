"use client";

import { useState, useTransition } from "react";
import { resetPassword } from "@/app/actions";
import { useT } from "@/lib/i18n/client";

/** Owner only: makes a temporary password and shows it once, to pass on. */
export function ResetPassword({ userId, name }: { userId: string; name: string }) {
  const t = useT();
  const [password, setPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  if (password) {
    return (
      <div className="reset-result" role="status">
        <p>
          {t("people.newPassword", { name })} <code dir="ltr">{password}</code>
        </p>
        <p className="muted small">{t("people.newPasswordHelp")}</p>
        <button
          className="btn"
          onClick={async () => {
            await navigator.clipboard.writeText(password).catch(() => {});
            setCopied(true);
          }}
        >
          {copied ? t("people.copied") : t("people.copy")}
        </button>
      </div>
    );
  }
  return (
    <button
      className="btn"
      disabled={pending}
      onClick={() =>
        confirm(t("people.resetConfirm", { name })) &&
        start(async () => setPassword((await resetPassword(userId))?.password ?? null))
      }
    >
      {t("people.resetPassword")}
    </button>
  );
}
