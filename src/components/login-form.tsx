"use client";

import { useActionState } from "react";
import { login, register, type FormState } from "@/app/actions";
import { useT } from "@/lib/i18n/client";

export function LoginForm({ firstRun, next }: { firstRun: boolean; next: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(login, undefined);
  const t = useT();
  return (
    <form action={action} className="login">
      {firstRun && <p>{t("login.welcome")}</p>}
      <input type="hidden" name="next" value={next} />
      <label className="field">
        <span>{t("field.username")}</span>
        <input
          key={state?.values?.username}
          name="username"
          defaultValue={state?.values?.username}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
        />
      </label>
      <label className="field">
        <span>{t("field.password")}</span>
        <input
          name="password"
          type="password"
          autoComplete={firstRun ? "new-password" : "current-password"}
          required
        />
      </label>
      <button className="primary" disabled={pending}>
        {pending ? t("login.signingIn") : firstRun ? t("login.createOwner") : t("login.submit")}
      </button>
      {state?.error && <p className="error" role="alert">{state.error}</p>}
    </form>
  );
}

export function RegisterForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(register, undefined);
  const t = useT();
  if (state?.ok) return <p role="status">{state.ok}</p>;
  return (
    <form action={action} className="login">
      <label className="field">
        <span>{t("field.yourName")}</span>
        <input name="displayName" defaultValue={state?.values?.displayName} autoComplete="name" maxLength={60} />
      </label>
      <label className="field">
        <span>{t("field.username")}</span>
        <input
          name="username"
          defaultValue={state?.values?.username}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
        />
      </label>
      <label className="field">
        <span>{t("field.newPassword")}</span>
        <input name="password" type="password" autoComplete="new-password" minLength={10} required />
      </label>
      <label className="field">
        <span>{t("register.note")}</span>
        <input name="note" defaultValue={state?.values?.note} maxLength={300} placeholder={t("register.notePlaceholder")} />
      </label>
      <button className="primary" disabled={pending}>
        {pending ? t("register.sending") : t("register.submit")}
      </button>
      {state?.error && <p className="error" role="alert">{state.error}</p>}
    </form>
  );
}

export function SimpleForm({
  action: serverAction,
  fields,
  submit,
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  fields: { name: string; label: string; type?: string; autoComplete?: string }[];
  submit: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(serverAction, undefined);
  return (
    <form action={action} className="simple-form">
      {fields.map(({ label, ...f }) => (
        <label key={f.name} className="field">
          <span>{label}</span>
          <input {...f} autoCapitalize="none" required />
        </label>
      ))}
      <button className="secondary" disabled={pending}>
        {submit}
      </button>
      {state?.error && <p className="error" role="alert">{state.error}</p>}
      {state?.ok && <p role="status">{state.ok}</p>}
    </form>
  );
}
