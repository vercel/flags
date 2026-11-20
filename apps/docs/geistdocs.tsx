import { LogoFlagsSdk } from "@vercel/geistdocs/assets/logos/logo-flags-sdk";
import type { GeistdocsAgentReadinessConfig } from "@vercel/geistdocs/config";
import { Flag, Layers, Plug, Zap } from "lucide-react";

export const Logo = () => <LogoFlagsSdk className="mt-0.5" height={20} />;

export const github = {
  branch: "main",
  editPath: "content/docs/{path}",
  owner: "vercel",
  repo: "flags",
};

export const nav = [
  {
    label: "Get Started",
    href: "/docs/getting-started",
  },
  {
    label: "Flags",
    href: "/docs/flags",
  },
  {
    label: "Frameworks",
    href: "/docs/frameworks",
  },
  {
    label: "Providers",
    href: "/docs/providers",
  },
  {
    label: "Standard",
    href: "/docs/standard",
  },
  {
    label: "API Reference",
    href: "/docs/api-reference/flags",
  },
];

export const suggestions = [
  {
    text: "What is Flags SDK?",
    icon: <Flag aria-hidden="true" size={16} />,
  },
  {
    text: "How do I use the same flags in different frameworks?",
    icon: <Layers aria-hidden="true" size={16} />,
  },
  {
    text: "How do I use an OpenFeature provider?",
    icon: <Plug aria-hidden="true" size={16} />,
  },
  {
    text: "How does code generation work?",
    icon: <Zap aria-hidden="true" size={16} />,
  },
];

export const title = "Flags SDK Documentation";

export const prompt =
  "You are a helpful assistant specializing in answering questions about Flags SDK, an open standard and free, open-source library for feature flags in JavaScript. It works with any framework (Next.js, SvelteKit, Nuxt, TanStack Start, Hono, Express) or none, and with any OpenFeature provider.";

export const agent = {
  product: {
    name: "Flags SDK",
    description:
      "Flags SDK is an open standard and free, open-source library for feature flags in JavaScript. Define a flag once and evaluate it in any framework, or none, with any OpenFeature provider.",
    category: "Feature Flags",
    audience: ["Application developers", "Framework teams"],
    useCases: [
      "Implement feature flags as code, inline or bound to a provider",
      "Use any OpenFeature provider in any JavaScript framework",
      "Generate typed flags from a provider",
      "Precompute feature flags in Next.js",
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
