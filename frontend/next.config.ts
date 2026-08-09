import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow LAN/mobile testing against the dev server (e.g. 192.168.1.198:3000).
  // Without this, Next.js 16 dev blocks JS chunk requests from non-localhost
  // hosts, leaving pages un-hydrated (dead buttons).
  allowedDevOrigins: ["192.168.1.198", "localhost"],
  turbopack: {
    root: process.cwd(),
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;