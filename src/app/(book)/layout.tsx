import Link from "next/link";
import { A11yControls } from "@/components/a11y-controls";
import { Avatar } from "@/components/avatar";
import { Icon } from "@/components/icons";
import { LanguageSwitch } from "@/components/language-switch";
import { TimersProvider } from "@/components/timers";
import { requireSession } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";

export default async function BookLayout({ children }: LayoutProps<"/">) {
  const me = await requireSession();
  const t = await getT();
  return (
    <TimersProvider>
      <header className="appbar">
        <div className="wrap">
          <Link href="/" className="wordmark">
            <span className="book" aria-hidden />
            {t("app.name")}
          </Link>
          <nav className="appbar-actions" aria-label={t("nav.main")}>
            <Link href="/add" className="btn btn-primary">
              <Icon name="plus" /> {t("nav.add")}
            </Link>
            <LanguageSwitch />
            <A11yControls />
            {me.isAdmin && (
              <Link href="/settings" className="btn">
                {t("nav.people")}
              </Link>
            )}
            <Link href="/profile" className="me" aria-label={t("nav.profile", { name: me.displayName })}>
              <Avatar name={me.displayName} src={me.avatarUrl} />
              {me.displayName}
            </Link>
          </nav>
        </div>
      </header>
      <main id="main" className="page">
        {children}
      </main>
    </TimersProvider>
  );
}
