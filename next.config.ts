import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // The crawler pulls in node-only deps; keep them out of the edge bundle.
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
