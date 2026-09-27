import Link from "next/link";
import { LanguageSwitch } from "@/components/language-switch";
import { LoginForm } from "@/components/login-form";
import { hasAnyUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { rich } from "@/lib/i18n/translate";

export async function generateMetadata() {
  return { title: (await getT())("login.title") };
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const t = await getT();
  const firstRun = !(await hasAnyUser());
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
      <section className="auth" aria-labelledby="signin-title">
        <h1 id="signin-title">{firstRun ? t("login.setupTitle") : t("login.title")}</h1>
        <LoginForm firstRun={firstRun} next={typeof next === "string" ? next : "/"} />
        {!firstRun && (
          <p style={{ marginTop: "var(--sp-5)" }}>
            {rich(t("login.newHere"), {
              link: (
                <Link key="register" href="/register">
                  {t("login.askAccess")}
                </Link>
              ),
            })}
          </p>
        )}
      </section>
    </main>
  );
}
