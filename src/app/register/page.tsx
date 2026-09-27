import Link from "next/link";
import { RegisterForm } from "@/components/login-form";

export const metadata = { title: "Ask for access" };

export default function RegisterPage() {
  return (
    <main id="main" className="page narrow login-page">
      <p className="wordmark">
        <span className="book" aria-hidden />
        Our cookbook
      </p>
      <div className="headband" aria-hidden />
      <section className="auth" aria-labelledby="register-title">
        <h1 id="register-title">Ask for access</h1>
        <p className="muted">The owner of the cookbook approves every new member.</p>
        <RegisterForm />
        <p style={{ marginTop: "var(--sp-5)" }}>
          <Link href="/login">Already approved? Sign in</Link>
        </p>
      </section>
    </main>
  );
}
