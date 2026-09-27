import { withBotId } from "botid/next/config";
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Recipe photos come from Vercel Blob and from the sites recipes were imported from.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https://*.public.blob.vercel-storage.com",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Microphone for voice notes; wake lock keeps the screen on during timers.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), screen-wake-lock=(self)" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Photos are downscaled in the browser first; this covers a few pages or a long voice note.
    // Vercel caps function request bodies at 4.5 MB.
    serverActions: { bodySizeLimit: "4mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withBotId(nextConfig);
