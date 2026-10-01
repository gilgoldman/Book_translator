"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import { Icon } from "./icons";

/**
 * On a phone, the top bar's settings and profile fold away behind a "Menu" button. On wider
 * screens they're always shown and the button is hidden (see .menu-toggle in globals.css).
 */
export function AppMenu({ children }: { children: React.ReactNode }) {
  const t = useT();
  const pathname = usePathname();
  // Open on the page it was opened on: moving to another page folds it away.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;

  return (
    <>
      <button
        type="button"
        className="btn menu-toggle"
        aria-expanded={open}
        aria-controls="app-menu"
        onClick={() => setOpenOn(open ? null : pathname)}
      >
        <Icon name={open ? "close" : "menu"} /> {t("nav.menu")}
      </button>
      <div id="app-menu" className="menu-items" data-open={open || undefined}>
        {children}
      </div>
    </>
  );
}
