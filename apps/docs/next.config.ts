import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";

const withMDX = createMDX();

const config: NextConfig = {
  experimental: {
    turbopackFileSystemCacheForDev: true,
  },

  // biome-ignore lint/suspicious/useAwait: rewrite is async
  async rewrites() {
    return [
      {
        source: "/{api-reference,frameworks,principles,providers}/:path*.mdx",
        destination: "/llms.mdx/:path*",
      },
      {
        source: "/{api-reference,frameworks,principles,providers}/:path*.md",
        destination: "/llms.mdx/:path*",
      },
    ];
  },

  async redirects() {
    return [
      {
        source: "/principles",
        destination: "/principles/flags-as-code",
        permanent: true,
      },
      {
        source: "/frameworks",
        destination: "/frameworks/next",
        permanent: true,
      },
      {
        source: "/api-reference",
        destination: "/api-reference/core/core",
        permanent: true,
      },
    ];
  },

  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "placehold.co",
      },
    ],
  },
};

export default withMDX(config);
