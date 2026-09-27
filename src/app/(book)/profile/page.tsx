import { and, desc, eq, isNull, sql } from "drizzle-orm";
import Link from "next/link";
import { changePassword, deleteRecipe, logout, setLanguage } from "@/app/actions";
import { Avatar } from "@/components/avatar";
import { Icon } from "@/components/icons";
import { SimpleForm } from "@/components/login-form";
import { AvatarForm, NameForm } from "@/components/profile-forms";
import { db, recipes } from "@/db";
import { requireSession } from "@/lib/auth";
import { LOCALE_CODES, LOCALES } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";
import { rich } from "@/lib/i18n/translate";

export async function generateMetadata() {
  return { title: (await getT())("profile.title") };
}

export default async function ProfilePage() {
  const me = await requireSession();
  const t = await getT();
  const mine = await db()
    .select({
      id: recipes.id,
      title: sql<string>`coalesce(${recipes.translations}->${t.locale}->>'title', ${recipes.title})`,
      createdAt: recipes.createdAt,
    })
    .from(recipes)
    .where(and(eq(recipes.createdBy, me.userId), isNull(recipes.duplicateOf)))
    .orderBy(desc(recipes.createdAt));
  const bot = process.env.TELEGRAM_BOT_USERNAME;

  return (
    <div className="narrow stack-sections">
      <div className="profile-head">
        <Avatar name={me.displayName} src={me.avatarUrl} size="lg" />
        <div>
          <p className="kicker">{t("profile.title")}</p>
          <h1 style={{ margin: 0 }}>{me.displayName}</h1>
          <p className="muted" style={{ margin: 0 }}>
            <bdi>@{me.username}</bdi>
            {me.isAdmin ? ` · ${t("profile.owner")}` : ""}
          </p>
        </div>
      </div>

      <section className="card" aria-labelledby="language">
        <h2 id="language">{t("profile.language")}</h2>
        <p className="muted">{t("profile.languageHelp")}</p>
        <div className="seg" role="radiogroup" aria-labelledby="language">
          {LOCALE_CODES.map((code) => (
            <form key={code} action={setLanguage.bind(null, code)}>
              <button role="radio" aria-checked={code === t.locale} lang={code}>
                {LOCALES[code].name}
              </button>
            </form>
          ))}
        </div>
      </section>

      <section className="card" aria-labelledby="about">
        <h2 id="about">{t("profile.nameAndPicture")}</h2>
        <NameForm current={me.displayName} />
        <AvatarForm hasAvatar={!!me.avatarUrl} />
      </section>

      <section className="card" aria-labelledby="mine">
        <h2 id="mine">{t("profile.mine", { n: mine.length })}</h2>
        {mine.length === 0 ? (
          <p>
            {t("profile.none")} <Link href="/add">{t("profile.addFirst")}</Link>
          </p>
        ) : (
          <ul className="my-recipes">
            {mine.map((r) => (
              <li key={r.id}>
                <Link className="title" href={`/recipes/${r.id}`} dir="auto">
                  {r.title}
                </Link>
                <div className="button-row">
                  <Link className="btn" href={`/recipes/${r.id}/edit`}>
                    <Icon name="edit" /> {t("common.edit")}
                  </Link>
                  <form action={deleteRecipe.bind(null, r.id, "/profile")}>
                    <button className="btn danger" aria-label={t("profile.deleteLabel", { title: r.title })}>
                      {t("common.delete")}
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p style={{ marginTop: "var(--sp-4)" }}>
          <Link href="/add" className="btn btn-primary">
            <Icon name="plus" /> {t("nav.add")}
          </Link>
        </p>
      </section>

      <section className="card" aria-labelledby="password">
        <h2 id="password">{t("profile.password")}</h2>
        <SimpleForm
          action={changePassword}
          submit={t("profile.password")}
          fields={[
            { name: "current", label: t("profile.currentPassword"), type: "password", autoComplete: "current-password" },
            { name: "next", label: t("profile.newPassword"), type: "password", autoComplete: "new-password" },
          ]}
        />
      </section>

      <section className="card" aria-labelledby="telegram">
        <h2 id="telegram">{t("profile.telegram")}</h2>
        {bot ? (
          <p>
            {rich(t("profile.telegramHow"), {
              bot: (
                <a key="bot" href={`https://t.me/${bot}`} dir="ltr">
                  @{bot}
                </a>
              ),
              command: (
                <code key="command" dir="ltr">
                  /login {me.username} {t("profile.telegramPassword")}
                </code>
              ),
            })}
          </p>
        ) : (
          <p className="muted">{t("profile.telegramMissing")}</p>
        )}
      </section>

      <form action={logout}>
        <button className="btn">{t("profile.signOut")}</button>
      </form>
    </div>
  );
}
