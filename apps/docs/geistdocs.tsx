import { LogoFlagsSdk } from "@/components/geistcn-fallbacks/geistcn-assets/logos/logo-flags-sdk";

export const Logo = () => <LogoFlagsSdk height={22} />;

export const github = {
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
  "You are a helpful assistant specializing in answering questions about Flags SDK, a free, open-source library for using feature flags in Next.js and SvelteKit.";

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
