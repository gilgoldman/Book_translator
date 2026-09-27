"use client";

import { useActionState } from "react";
import { login, register, type FormState } from "@/app/actions";

export function LoginForm({ firstRun, next }: { firstRun: boolean; next: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(login, undefined);
  return (
    <form action={action} className="login">
      {firstRun && <p>Welcome. Sign in with the owner username and choose a password.</p>}
      <input type="hidden" name="next" value={next} />
      <label className="field">
        <span>Username</span>
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
        <span>Password</span>
        <input
          name="password"
          type="password"
          autoComplete={firstRun ? "new-password" : "current-password"}
          required
        />
      </label>
      <button className="primary" disabled={pending}>
        {pending ? "Signing in…" : firstRun ? "Create owner account" : "Sign in"}
      </button>
      {state?.error && <p className="error" role="alert">{state.error}</p>}
    </form>
  );
}

export function RegisterForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(register, undefined);
  if (state?.ok) return <p role="status">{state.ok}</p>;
  return (
    <form action={action} className="login">
      <label className="field">
        <span>Your name</span>
        <input name="displayName" defaultValue={state?.values?.displayName} autoComplete="name" maxLength={60} />
      </label>
      <label className="field">
        <span>Username</span>
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
        <span>Password (10+ characters)</span>
        <input name="password" type="password" autoComplete="new-password" minLength={10} required />
      </label>
      <label className="field">
        <span>A note for the owner (optional)</span>
        <input name="note" defaultValue={state?.values?.note} maxLength={300} placeholder="Hi, it's Mira from next door" />
      </label>
      <button className="primary" disabled={pending}>
        {pending ? "Sending…" : "Request access"}
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
