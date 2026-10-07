import type { NextConfig } from "next";

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : "*.supabase.co";

const nextConfig: NextConfig = {
  images: {
    // Uploaded photos are served from public Supabase Storage buckets.
    remotePatterns: [
      { protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/**" },
    ],
  },
  experimental: {
    // Profile photos are uploaded through a Server Action; the default
    // 1MB limit is too small for most phone photos.
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
