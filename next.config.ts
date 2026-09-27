import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Photos are downscaled in the browser first; this covers a few pages or a long voice note.
    // Vercel caps function request bodies at 4.5 MB.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
