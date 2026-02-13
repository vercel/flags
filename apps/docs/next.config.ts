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
        hostname: "assets.vercel.com",
      },
    ],
  },

  redirects: async () => {
    /**
     * At first all docs pages were at /docs/*, but we moved them to the root
     * - /principles
     * - /frameworks
     * - /providers
     * - /api-reference
     */
    const sourceToDestination = {
      // -----------------------------------------------------------------------
      // Routes of redesigned page (before new information architecture)
      // -----------------------------------------------------------------------
      '/docs/adapters/custom-adapters': '/providers/custom-adapters',
      '/docs/adapters/supported-providers': '/providers',
      '/docs/api-reference/adapters/edge-config': '/providers/edge-config',
      '/docs/api-reference/adapters/hypertune': '/providers/hypertune',
      '/docs/api-reference/adapters/launchdarkly': '/providers/launchdarkly',
      '/docs/api-reference/adapters/optimizely': '/providers/optimizely',
      '/docs/api-reference/adapters/split': '/providers/split',
      '/docs/api-reference/adapters/statsig': '/providers/statsig',
      '/docs/api-reference/adapters/openfeature': '/providers/openfeature',
      '/docs/concepts/data-locality': '/principles/data-locality',
      '/docs/concepts/dedupe': '/frameworks/next/dedupe',
      '/docs/concepts/evaluation-context': '/principles/evaluation-context',
      '/docs/concepts/flags-as-code': '/principles/flags-as-code',
      '/docs/concepts/precompute': '/principles/precompute',
      '/docs/concepts/server-side-vs-client-side':
        '/principles/server-side-vs-client-side',
      '/docs/examples/edge-middleware': '/frameworks/next/examples/proxy',
      '/docs/examples/suspense-fallbacks':
        '/frameworks/next/examples/suspense-fallbacks',
      '/docs/getting-started/next': '/frameworks/next',
      '/docs/getting-started/sveltekit': '/frameworks/sveltekit',
      '/docs/guides/dashboard-pages': '/frameworks/next/guides/dashboard-pages',
      '/docs/guides/marketing-pages': '/frameworks/next/guides/marketing-pages',
      '/docs/vercel': 'https://vercel.com/docs/feature-flags',

      // -----------------------------------------------------------------------
      // Renamed adapters
      // -----------------------------------------------------------------------
      '/providers/bucket': '/providers/reflag',
      '/providers/openfeature/bucket': '/providers/reflag',

      // -----------------------------------------------------------------------
      // Routes of original page (before redesign)
      // -----------------------------------------------------------------------
      '/getting-started/quickstart': '/frameworks/next',
      '/knowledge-base': '/principles/flags-as-code',
      '/knowledge-base/flags-as-code': '/principles/flags-as-code',
      '/knowledge-base/server-side-vs-client-side':
        '/principles/server-side-vs-client-side',
      '/knowledge-base/data-locality': '/principles/data-locality',
      '/principles': '/principles/flags-as-code',
      '/concepts/identify': '/principles/evaluation-context',
      '/concepts/dedupe': '/frameworks/next/dedupe',
      '/concepts/precompute': '/frameworks/next/precompute',
      '/concepts/adapters': '/providers',
      '/examples/dashboard-pages': '/frameworks/next/guides/dashboard-pages',
      '/examples/marketing-pages': '/frameworks/next/guides/marketing-pages',
      '/examples/feature-flags-in-edge-middleware':
        '/frameworks/next/examples/proxy',
      '/api-reference': '/api-reference/core/core',
      '/api-reference/core': '/api-reference/core/core',
      '/api-reference/react': '/api-reference/core/react',
      '/api-reference/sveltekit': '/api-reference/frameworks/sveltekit',
      '/api-reference/next': '/api-reference/frameworks/next',
      '/api-reference/provider/launchdarkly': '/providers/launchdarkly',
      '/api-reference/provider/statsig': '/providers/statsig',
      '/api-reference/provider/split': '/providers/split',
      '/api-reference/provider/optimizely': '/providers/optimizely',
      '/api-reference/provider/hypertune': '/providers/hypertune',
      '/api-reference/provider/edge-config': '/providers/edge-config',
      '/docs/concepts/flags': '/principles/flags-as-code',
      '/docs/concepts/flags.ts': '/principles/flags-as-code',
      '/docs/frameworks/next/overview': '/frameworks/next',
      '/docs/examples/marketing-pages':
        '/frameworks/next/guides/marketing-pages',
      '/docs/examples/dashboard-pages':
        '/frameworks/next/guides/dashboard-pages',
      '/examples': '/frameworks/next',
      '/examples/pages-router': '/frameworks/next#pages-router',
      '/docs/flags': '/api-reference/core/core',
      '/flags': '/api-reference/core/core',
      '/home-a': '/',
      '/home-a/page.tsx': '/',
      '/home-b': '/',
    };

    return [
      {
        source: '/docs',
        destination: '/frameworks/next',
        permanent: false,
      },
      {
        source: '/ship',
        destination: 'https://flags-sdk-workshop.vercel.app/',
        permanent: false,
      },
      {
        source: '/workshop',
        destination: 'https://flags-sdk-workshop.vercel.app/',
        permanent: false,
      },
      ...Object.entries(sourceToDestination).map(([source, destination]) => ({
        source,
        destination: destination.startsWith('http') ? destination : `/docs${destination}`,
        permanent: true,
      })),
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
        source: "/docs/principles",
        destination: "/docs/principles/flags-as-code",
        permanent: true,
      },
      {
        source: "/frameworks",
        destination: "/docs/frameworks/next",
        permanent: true,
      },
      {
        source: "/docs/frameworks",
        destination: "/docs/frameworks/next",
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
        destination: "/docs/api-reference/core/core",
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
