import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Profile photos are uploaded through a Server Action; the default
    // 1MB limit is too small for most phone photos.
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
