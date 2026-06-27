import { LogoFlagsSdk } from "@vercel/geistdocs/assets/logos/logo-flags-sdk";
import type { GeistdocsAgentReadinessConfig } from "@vercel/geistdocs/config";

export const Logo = () => <LogoFlagsSdk height={22} />;

export const github = {
  branch: "main",
  editPath: "content/docs/{path}",
  owner: "vercel",
  repo: "flags",
};

export const nav = [
  {
    label: "Principles",
    href: "/docs/principles/flags-as-code",
  },
  {
    label: "Frameworks",
    href: "/docs/frameworks/next",
  },
  {
    label: "Providers",
    href: "/docs/providers",
  },
  {
    label: "API Reference",
    href: "/docs/api-reference/core/core",
  },
];

export const suggestions = [
  "What is Flags SDK?",
  "What frameworks are supported by Flags SDK?",
  "Which providers are supported by Flags SDK?",
  "How do I precompute flags?",
];

export const title = "Flags SDK Documentation";

export const prompt =
  "You are a helpful assistant specializing in answering questions about Flags SDK, a free, open-source library for using feature flags in Next.js, SvelteKit, and TanStack Start.";

export const agent = {
  product: {
    name: "Flags SDK",
    description:
      "Flags SDK is a free, open-source library for using feature flags in Next.js, SvelteKit, and TanStack Start.",
    category: "Feature Flags",
    audience: ["Application developers", "Framework teams"],
    useCases: [
      "Implement feature flags as code",
      "Connect feature flags to providers",
      "Precompute feature flags in supported frameworks",
    ],
  },
  links: [
    {
      label: "Flags SDK source",
      href: `https://github.com/${github.owner}/${github.repo}`,
      description: "Source repository for Flags SDK",
    },
  ],
} satisfies GeistdocsAgentReadinessConfig;

export const translations = {
  en: {
    displayName: "English",
  },
};

export const basePath: string | undefined = undefined;

/**
 * Unique identifier for this site, used in markdown request tracking analytics.
 * Each site using geistdocs should set this to a unique value (e.g. "ai-sdk-docs", "next-docs").
 */
export const siteId: string | undefined = "flags-sdk";
