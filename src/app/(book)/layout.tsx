import Link from "next/link";
import { A11yControls } from "@/components/a11y-controls";
import { TimersProvider } from "@/components/timers";
import { requireSession } from "@/lib/auth";

export default async function BookLayout({ children }: LayoutProps<"/">) {
  await requireSession();
  return (
    <TimersProvider>
      <header className="site-header">
        <Link href="/" className="brand">
          Cookbook
        </Link>
        <nav aria-label="Main">
          <Link href="/add" className="nav-link">
            <span aria-hidden>+</span> Add
          </Link>
          <A11yControls />
          <Link href="/settings" className="nav-link">
            Settings
          </Link>
        </nav>
      </header>
      <main id="main" className="page">
        {children}
      </main>
    </TimersProvider>
  );
}
