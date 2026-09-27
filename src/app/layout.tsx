import type { Metadata, Viewport } from "next";
import { A11Y_BOOT_SCRIPT } from "@/components/a11y-controls";
import { LOCALES } from "@/lib/i18n/config";
import { I18nProvider } from "@/lib/i18n/client";
import { MESSAGES } from "@/lib/i18n/messages";
import { getLocale, getT } from "@/lib/i18n/server";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: { default: t("app.title"), template: `%s · ${t("app.title")}` },
    description: t("app.description"),
    manifest: "/manifest.webmanifest",
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#6B1E24" },
    { media: "(prefers-color-scheme: dark)", color: "#18120D" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  const t = await getT();
  return (
    <html
      lang={locale}
      dir={LOCALES[locale].dir}
      data-text-size="normal"
      suppressHydrationWarning
      // Labels the stylesheet adds with ::after, in the reader's language.
      style={
        {
          "--t-selected": JSON.stringify(`✓ ${t("css.selected")}`),
          "--t-done": JSON.stringify(`✓ ${t("css.done")}`),
        } as React.CSSProperties
      }
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- one shared stylesheet for every page */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:ital,wght@0,400..800;1,400..800&family=Noto+Sans+Hebrew:wght@400..800&display=swap"
        />
        <script dangerouslySetInnerHTML={{ __html: A11Y_BOOT_SCRIPT }} />
      </head>
      <body>
        <a href="#main" className="skip-link">
          {t("app.skip")}
        </a>
        <I18nProvider locale={locale} messages={MESSAGES[locale]}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
