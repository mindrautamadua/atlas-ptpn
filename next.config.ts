import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Alias Inertia → compat shim (komponen view dipakai verbatim).
  turbopack: {
    resolveAlias: {
      "@inertiajs/react": "./src/lib/inertia-compat.tsx",
    },
  },
  // PWA: serve the service worker uncached as JS, plus baseline security headers.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
    ];
  },
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@inertiajs/react": path.resolve(__dirname, "src/lib/inertia-compat.tsx"),
    };
    return config;
  },
};

export default nextConfig;
