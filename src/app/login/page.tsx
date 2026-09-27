import Link from "next/link";
import { LoginForm } from "@/components/login-form";
import { hasAnyUser } from "@/lib/auth";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const firstRun = !(await hasAnyUser());
  return (
    <main id="main" className="page narrow login-page">
      <h1 className="brand">Cookbook</h1>
      <LoginForm firstRun={firstRun} next={typeof next === "string" ? next : "/"} />
      {!firstRun && (
        <p className="small">
          New here? <Link href="/register">Request access</Link>
        </p>
      )}
    </main>
  );
}
