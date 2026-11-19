import { withFlags } from '@flags-sdk/next/plugin';
import { withVercelToolbar } from '@vercel/toolbar/plugins/next';
import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";

const withMDX = createMDX();

const config: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,

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
      '/docs/adapters/custom-adapters': '/providers/custom-providers',
      '/docs/adapters/supported-providers': '/providers',
      '/docs/api-reference/adapters/edge-config': '/providers/custom-providers',
      '/docs/api-reference/adapters/hypertune': '/providers/openfeature#hypertune',
      '/docs/api-reference/adapters/launchdarkly':
        '/providers/openfeature#launchdarkly',
      '/docs/api-reference/adapters/optimizely':
        '/providers/openfeature#other-providers',
      '/docs/api-reference/adapters/split': '/providers/openfeature#split',
      '/docs/api-reference/adapters/statsig':
        '/providers/openfeature#other-providers',
      '/docs/api-reference/adapters/openfeature': '/providers/openfeature',
      '/docs/concepts/data-locality': '/principles/data-locality',
      '/docs/concepts/dedupe': '/flags/evaluating-flags',
      '/docs/concepts/evaluation-context': '/principles/evaluation-context',
      '/docs/concepts/flags-as-code': '/principles/flags-as-code',
      '/docs/concepts/precompute': '/principles/precompute',
      '/docs/concepts/server-side-vs-client-side':
        '/principles/server-side-vs-client-side',
      '/docs/examples/edge-middleware': '/frameworks/next',
      '/docs/examples/suspense-fallbacks': '/frameworks/next/precompute',
      '/docs/getting-started/next': '/frameworks/next',
      '/docs/getting-started/sveltekit': '/frameworks/sveltekit',
      '/docs/guides/dashboard-pages': '/frameworks/next',
      '/docs/guides/marketing-pages': '/frameworks/next/precompute',
      '/docs/vercel': 'https://vercel.com/docs/feature-flags',

      // -----------------------------------------------------------------------
      // Pages of v4, before the docs of v5
      // -----------------------------------------------------------------------
      '/docs/frameworks/next/evaluation-context': '/flags/evaluation-context',
      '/docs/frameworks/next/dedupe': '/flags/evaluating-flags',
      '/docs/frameworks/next/bulk-evaluation': '/flags/evaluating-flags',
      '/docs/frameworks/next/guides/dashboard-pages': '/frameworks/next',
      '/docs/frameworks/next/guides/marketing-pages':
        '/frameworks/next/precompute',
      '/docs/frameworks/next/guides/unit-tests': '/flags/testing',
      '/docs/frameworks/next/guides/e2e-tests': '/flags/testing',
      '/docs/frameworks/next/examples/proxy': '/frameworks/next',
      '/docs/frameworks/next/examples/suspense-fallbacks':
        '/frameworks/next/precompute',
      '/docs/frameworks/sveltekit/evaluation-context': '/flags/evaluation-context',
      '/docs/frameworks/sveltekit/precompute': '/principles/precompute',
      '/docs/frameworks/sveltekit/guides/dashboard-pages': '/frameworks/sveltekit',
      '/docs/frameworks/sveltekit/guides/marketing-pages': '/frameworks/sveltekit',
      '/docs/frameworks/sveltekit/guides/unit-tests': '/flags/testing',
      '/docs/frameworks/sveltekit/guides/e2e-tests': '/flags/testing',
      '/docs/providers/custom-adapters': '/providers/custom-providers',
      '/docs/providers/global-config': '/providers/custom-providers',
      '/docs/providers/growthbook': '/providers/openfeature#growthbook',
      '/docs/providers/hypertune': '/providers/openfeature#hypertune',
      '/docs/providers/launchdarkly': '/providers/openfeature#launchdarkly',
      '/docs/providers/posthog': '/providers/openfeature#posthog',
      '/docs/providers/split': '/providers/openfeature#split',
      '/docs/providers/statsig': '/providers/openfeature#other-providers',
      '/docs/providers/flagsmith': '/providers/openfeature#other-providers',
      '/docs/providers/reflag': '/providers/openfeature#other-providers',
      '/docs/providers/optimizely': '/providers/openfeature#other-providers',
      '/docs/providers/openfeature/abtasty': '/providers/openfeature#ab-tasty',
      '/docs/providers/openfeature/cloudbees': '/providers/openfeature#cloudbees',
      '/docs/providers/openfeature/confidence-by-spotify':
        '/providers/openfeature#confidence-by-spotify',
      '/docs/providers/openfeature/configcat': '/providers/openfeature#configcat',
      '/docs/providers/openfeature/devcycle': '/providers/openfeature#devcycle',
      '/docs/providers/openfeature/featbit': '/providers/openfeature#featbit',
      '/docs/providers/openfeature/flagd': '/providers/openfeature#flagd',
      '/docs/providers/openfeature/flipt': '/providers/openfeature#flipt',
      '/docs/providers/openfeature/go': '/providers/openfeature#go-feature-flag',
      '/docs/providers/openfeature/growthbook': '/providers/openfeature#growthbook',
      '/docs/providers/openfeature/hypertune': '/providers/openfeature#hypertune',
      '/docs/providers/openfeature/kameloon': '/providers/openfeature#kameleoon',
      '/docs/providers/openfeature/posthog': '/providers/openfeature#posthog',
      '/docs/providers/openfeature/split': '/providers/openfeature#split',
      '/docs/providers/openfeature/tggl': '/providers/openfeature#tggl',
      '/docs/api-reference/core/core': '/api-reference/flags',
      '/docs/api-reference/core/react': '/api-reference/flags',
      '/docs/api-reference/frameworks/next': '/api-reference/next',
      '/docs/api-reference/frameworks/sveltekit':
        '/api-reference/framework-packages',

      // -----------------------------------------------------------------------
      // Renamed adapters
      // -----------------------------------------------------------------------
      '/providers/bucket': '/providers/openfeature#other-providers',
      '/providers/openfeature/bucket': '/providers/openfeature#other-providers',

      // -----------------------------------------------------------------------
      // Routes of original page (before redesign)
      // -----------------------------------------------------------------------
      '/getting-started/quickstart': '/getting-started/quickstart',
      '/knowledge-base': '/principles/flags-as-code',
      '/knowledge-base/flags-as-code': '/principles/flags-as-code',
      '/knowledge-base/server-side-vs-client-side':
        '/principles/server-side-vs-client-side',
      '/knowledge-base/data-locality': '/principles/data-locality',
      '/principles': '/principles/flags-as-code',
      '/concepts/identify': '/principles/evaluation-context',
      '/concepts/dedupe': '/flags/evaluating-flags',
      '/concepts/precompute': '/frameworks/next/precompute',
      '/concepts/adapters': '/providers',
      '/examples/dashboard-pages': '/frameworks/next',
      '/examples/marketing-pages': '/frameworks/next/precompute',
      '/examples/feature-flags-in-edge-middleware': '/frameworks/next',
      '/api-reference': '/api-reference/flags',
      '/api-reference/core': '/api-reference/flags',
      '/api-reference/react': '/api-reference/flags',
      '/api-reference/sveltekit': '/api-reference/framework-packages',
      '/api-reference/next': '/api-reference/next',
      '/api-reference/provider/launchdarkly':
        '/providers/openfeature#launchdarkly',
      '/api-reference/provider/statsig': '/providers/openfeature#other-providers',
      '/api-reference/provider/split': '/providers/openfeature#split',
      '/api-reference/provider/optimizely':
        '/providers/openfeature#other-providers',
      '/api-reference/provider/hypertune': '/providers/openfeature#hypertune',
      '/api-reference/provider/edge-config': '/providers/custom-providers',
      '/docs/concepts/flags': '/flags',
      '/docs/concepts/flags.ts': '/flags',
      '/docs/frameworks/next/overview': '/frameworks/next',
      '/docs/examples/marketing-pages': '/frameworks/next/precompute',
      '/docs/examples/dashboard-pages': '/frameworks/next',
      '/examples': '/frameworks',
      '/examples/pages-router': '/frameworks/next',
      '/flags': '/flags',
      '/home-a': '/',
      '/home-a/page.tsx': '/',
      '/home-b': '/',
      "/docs/core-concepts/precompute": "/principles/precompute",

      // -----------------------------------------------------------------------
      // Shortcuts
      // -----------------------------------------------------------------------
      "/precompute": "/frameworks/next/precompute",
      "/quickstart": "/getting-started/quickstart",
      "/standard": "/standard",
    };

    return [
      {
        source: '/docs',
        destination: '/docs/getting-started',
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
        destination: "/docs/api-reference/flags",
        permanent: true,
      },
      {
        source: "/docs/api-reference",
        destination: "/docs/api-reference/flags",
        permanent: false,
      },
      {
        source: "/docs/tooling",
        destination: "/docs/tooling/flags-explorer",
        permanent: false,
      },
      {
        source: "/api-reference/:path*",
        destination: "/docs/api-reference/:path*",
        permanent: true,
      },
    ];
  },
};

// withFlags connects the Flags SDK to Next.js: the request of each page,
// the 'use flags' modules, and the secret of precompute
export default withFlags(withVercelToolbar()(withMDX(config)));
