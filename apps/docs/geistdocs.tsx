export const Logo = () => (
  <div className="flex items-center gap-2">
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <title>Flags Logo</title>
      <path fillRule="evenodd" clipRule="evenodd" d="M12 0C14.2091 0 16 1.79086 16 4V12C16 14.2091 14.2091 16 12 16H4C1.79086 16 0 14.2091 0 12V4C0 1.79086 1.79086 0 4 0H12ZM6.5 5.25C5.25 5.25001 4.5 6 4.5 6V10.5C4.5 10.5 5.25 9.75 6.5 9.75C7.75 9.75 8.25 10.75 9.5 10.75C10.75 10.75 11.5 10.125 11.5 10.125V5.625C11.5 5.625 10.75 6.25 9.5 6.25C8.25 6.25 7.75 5.24999 6.5 5.25Z" fill="currentColor" />
    </svg>

    <p className="font-semibold text-xl tracking-tight">Flags SDK</p>
  </div>
);

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
