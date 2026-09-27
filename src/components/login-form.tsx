"use client";

import { useActionState } from "react";
import { login, type FormState } from "@/app/actions";

export function LoginForm({ firstRun, next }: { firstRun: boolean; next: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(login, undefined);
  return (
    <form action={action} className="login">
      {firstRun && <p className="muted">Welcome. Choose the username and password for the owner account.</p>}
      <input type="hidden" name="next" value={next} />
      <input name="username" placeholder="username" autoComplete="username" autoCapitalize="none" required />
      <input
        name="password"
        type="password"
        placeholder="password"
        autoComplete={firstRun ? "new-password" : "current-password"}
        required
      />
      <button className="primary" disabled={pending}>
        {firstRun ? "Create account" : "Open the cookbook"}
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
  fields: { name: string; placeholder: string; type?: string; autoComplete?: string }[];
  submit: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(serverAction, undefined);
  return (
    <form action={action} className="simple-form">
      {fields.map((f) => (
        <input key={f.name} {...f} autoCapitalize="none" required={f.name !== "displayName"} />
      ))}
      <button className="quiet" disabled={pending}>{submit}</button>
      {state?.error && <p className="error" role="alert">{state.error}</p>}
      {state?.ok && <p className="muted">{state.ok}</p>}
    </form>
  );
}
