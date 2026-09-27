import type { Metadata, Viewport } from "next";
import { A11Y_BOOT_SCRIPT } from "@/components/a11y-controls";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Cookbook", template: "%s · Cookbook" },
  description: "Our family cookbook",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#6B1E24" },
    { media: "(prefers-color-scheme: dark)", color: "#18120D" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-text-size="normal" suppressHydrationWarning>
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
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
