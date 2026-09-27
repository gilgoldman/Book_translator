import Link from "next/link";
import { LanguageSwitch } from "@/components/language-switch";
import { RegisterForm } from "@/components/login-form";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("register.title") };
}

export default async function RegisterPage() {
  const t = await getT();
  return (
    <main id="main" className="page narrow login-page">
      <div className="auth-top">
        <p className="wordmark">
          <span className="book" aria-hidden />
          {t("app.name")}
        </p>
        <LanguageSwitch />
      </div>
      <div className="headband" aria-hidden />
      <section className="auth" aria-labelledby="register-title">
        <h1 id="register-title">{t("register.title")}</h1>
        <p className="muted">{t("register.lead")}</p>
        <RegisterForm />
        <p style={{ marginTop: "var(--sp-5)" }}>
          <Link href="/login">{t("register.already")}</Link>
        </p>
      </section>
    </main>
  );
}
