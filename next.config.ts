import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Alias Inertia → compat shim (komponen view dipakai verbatim).
  turbopack: {
    resolveAlias: {
      "@inertiajs/react": "./src/lib/inertia-compat.tsx",
    },
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
