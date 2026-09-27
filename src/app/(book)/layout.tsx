import Link from "next/link";
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
        <nav>
          <Link href="/add" aria-label="Add a recipe" className="nav-add">
            +
          </Link>
          <Link href="/settings" aria-label="Settings" className="nav-more">
            ···
          </Link>
        </nav>
      </header>
      <main className="page">{children}</main>
    </TimersProvider>
  );
}
