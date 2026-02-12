import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";

const withMDX = createMDX();

const config: NextConfig = {
  experimental: {
    turbopackFileSystemCacheForDev: true,
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

  redirects: async () => {
    return [
      {
        source: "/principles",
        destination: "/docs/principles",
        permanent: true,
      },
      {
        source: "/principles/:path*",
        destination: "/docs/principles/:path*",
        permanent: true,
      },
      {
        source: "/frameworks",
        destination: "/docs/frameworks",
        permanent: true,
      },
      {
        source: "/frameworks/:path*",
        destination: "/docs/frameworks/:path*",
        permanent: true,
      },
      {
        source: "/providers",
        destination: "/docs/providers",
        permanent: true,
      },
      {
        source: "/providers/:path*",
        destination: "/docs/providers/:path*",
        permanent: true,
      },
      {
        source: "/api-reference",
        destination: "/docs/api-reference",
        permanent: true,
      },
      {
        source: "/api-reference/:path*",
        destination: "/docs/api-reference/:path*",
        permanent: true,
      },
    ];
  },
};

export default withMDX(config);
