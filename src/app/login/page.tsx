import Link from "next/link";
import { LoginForm } from "@/components/login-form";
import { hasAnyUser } from "@/lib/auth";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const firstRun = !(await hasAnyUser());
  return (
    <main id="main" className="page narrow login-page">
      <p className="wordmark">
        <span className="book" aria-hidden />
        Our cookbook
      </p>
      <div className="headband" aria-hidden />
      <section className="auth" aria-labelledby="signin-title">
        <h1 id="signin-title">{firstRun ? "Set up the cookbook" : "Sign in"}</h1>
        <LoginForm firstRun={firstRun} next={typeof next === "string" ? next : "/"} />
        {!firstRun && (
          <p style={{ marginTop: "var(--sp-5)" }}>
            New here? <Link href="/register">Ask for access</Link>
          </p>
        )}
      </section>
    </main>
  );
}
