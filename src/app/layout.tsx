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
    { media: "(prefers-color-scheme: light)", color: "#f6f3ee" },
    { media: "(prefers-color-scheme: dark)", color: "#1b1a18" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-text-size="normal" suppressHydrationWarning>
      <head>
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
