import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Resolve node: built-ins for Turbopack server chunks (avoids ChunkLoadError for node:crypto)
  turbopack: {
    resolveAlias: {
      "node:crypto": "crypto",
      "node:stream": "stream",
      "node:buffer": "buffer",
    },
  },
  // Keep in sync with ALLOWED_IMAGE_HOSTS in app/lib/media.ts
  // Guard: "webpsave_buffer: no property named `smart_deblock`" is emitted by libvips when WebP
  // is used. Next.js only allows formats: "image/avif" | "image/webp". Using avif-only avoids
  // the WebP path; if the warning persists, it is from another image path (e.g. sharp elsewhere).
  images: {
    formats: ["image/avif"],
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