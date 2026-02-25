import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep in sync with ALLOWED_IMAGE_HOSTS in app/lib/media.ts
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "pub-2d4238639a274f32ba8641274e00f39c.r2.dev",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "media.hhi-builders.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;