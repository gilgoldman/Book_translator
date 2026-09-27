"use client";

import { useActionState, useState, useTransition } from "react";
import { removeAvatar, updateAvatar, updateProfile, type FormState } from "@/app/actions";
import { downscaleImage } from "@/lib/image";

export function NameForm({ current }: { current: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateProfile, undefined);
  return (
    <form action={action} className="form">
      <label className="field">
        <span>Your name, as others see it</span>
        <input name="displayName" defaultValue={current} maxLength={60} autoComplete="name" required />
      </label>
      <div className="button-row">
        <button className="btn" disabled={pending}>
          Save name
        </button>
      </div>
      {state?.error && <p className="error">{state.error}</p>}
      {state?.ok && <p role="status">{state.ok}</p>}
    </form>
  );
}

export function AvatarForm({ hasAvatar }: { hasAvatar: boolean }) {
  const [pending, start] = useTransition();
  const [status, setStatus] = useState("");
  return (
    <div className="form" style={{ marginTop: "var(--sp-5)" }}>
      <label className="field">
        <span>Profile picture</span>
        <input
          type="file"
          accept="image/*"
          disabled={pending}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const form = new FormData();
            form.set("avatar", await downscaleImage(file, 512, 0.85));
            start(async () => {
              await updateAvatar(form);
              setStatus("Picture updated.");
            });
            e.target.value = "";
          }}
        />
      </label>
      {hasAvatar && (
        <div className="button-row">
          <button
            className="btn"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await removeAvatar();
                setStatus("Picture removed.");
              })
            }
          >
            Remove picture
          </button>
        </div>
      )}
      <p role="status">{pending ? "Saving…" : status}</p>
    </div>
  );
}
