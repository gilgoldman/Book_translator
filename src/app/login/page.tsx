import { LoginForm } from "@/components/login-form";
import { hasAnyUser } from "@/lib/auth";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  return (
    <main className="page narrow login-page">
      <h1 className="brand">Cookbook</h1>
      <LoginForm firstRun={!(await hasAnyUser())} next={typeof next === "string" ? next : "/"} />
    </main>
  );
}
