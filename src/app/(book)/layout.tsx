import Link from "next/link";
import { A11yControls } from "@/components/a11y-controls";
import { Avatar } from "@/components/avatar";
import { Icon } from "@/components/icons";
import { TimersProvider } from "@/components/timers";
import { requireSession } from "@/lib/auth";

export default async function BookLayout({ children }: LayoutProps<"/">) {
  const me = await requireSession();
  return (
    <TimersProvider>
      <header className="appbar">
        <div className="wrap">
          <Link href="/" className="wordmark">
            <span className="book" aria-hidden />
            Our cookbook
          </Link>
          <nav className="appbar-actions" aria-label="Main">
            <Link href="/add" className="btn btn-primary">
              <Icon name="plus" /> Add a recipe
            </Link>
            <A11yControls />
            {me.isAdmin && (
              <Link href="/settings" className="btn">
                People
              </Link>
            )}
            <Link href="/profile" className="me" aria-label={`Your profile, ${me.displayName}`}>
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
