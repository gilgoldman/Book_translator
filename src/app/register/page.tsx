import Link from "next/link";
import { RegisterForm } from "@/components/login-form";

export const metadata = { title: "Request access" };

export default function RegisterPage() {
  return (
    <main id="main" className="page narrow login-page">
      <h1 className="brand">Cookbook</h1>
      <p>Ask for access. The owner will approve your request.</p>
      <RegisterForm />
      <p className="small">
        <Link href="/login">Already approved? Sign in</Link>
      </p>
    </main>
  );
}
