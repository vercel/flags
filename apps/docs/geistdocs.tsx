import { LogoFlagsSdk } from "@vercel/geistdocs/assets/logos/logo-flags-sdk";
import type { GeistdocsAgentReadinessConfig } from "@vercel/geistdocs/config";
import { Sparkles, Layers, Plug, Zap, Play } from "lucide-react";

export const Logo = () => <LogoFlagsSdk className="mt-0.5" height={20} />;

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
  {
    text: "What is the Flags SDK?",
    icon: <Sparkles aria-hidden="true" size={16} />,
  },
  {
    text: "How can I get started with Next.js?",
    icon: <Play aria-hidden="true" size={16} />,
  },
  {
    text: "What frameworks are supported by Flags SDK?",
    icon: <Layers aria-hidden="true" size={16} />,
  },
  {
    text: "Which providers are supported by Flags SDK?",
    icon: <Plug aria-hidden="true" size={16} />,
  },
  {
    text: "How do I precompute flags?",
    icon: <Zap aria-hidden="true" size={16} />,
  },
];

export const title = "Flags SDK Documentation";

export const prompt =
  "You are a helpful assistant specializing in answering questions about Flags SDK, a free, open-source library for using feature flags in Next.js and SvelteKit.";

export const agent = {
  product: {
    name: "Flags SDK",
    description:
      "Flags SDK is a free, open-source library for using feature flags in Next.js and SvelteKit.",
    category: "Feature Flags",
    audience: ["Application developers", "Framework teams"],
    useCases: [
      "Implement feature flags as code",
      "Connect feature flags to providers",
      "Precompute feature flags in supported frameworks",
    ],
  },
  api: {
    siteOpenApiUrl: "/openapi.json",
  },
  links: [
    {
      label: "Flags SDK source",
      href: `https://github.com/${github.owner}/${github.repo}`,
      description: "Source repository for Flags SDK",
    },
    {
      label: "Flags SDK on npm",
      href: "https://www.npmjs.com/package/flags",
      description: "Install the flags package from npm",
    },
  ],
  instructions: [
    "Flags SDK is a library, not a hosted service. Install it from npm and follow the framework guides; there is no runtime API to call.",
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
