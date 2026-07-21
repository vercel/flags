import { LogoEve } from "@vercel/geistdocs/assets/logos/logo-eve";
import {
  defineConfig,
  type GeistdocsNavbarOssProduct,
} from "@vercel/geistdocs/config";
import {
  agent,
  basePath,
  github,
  Logo,
  nav,
  prompt,
  siteId,
  suggestions,
  title,
  translations,
} from "@/geistdocs";

// geistdocs' default OSS products, minus Flags SDK (this site).
const navbarOssProducts: GeistdocsNavbarOssProduct[] = [
  {
    description: "The framework for building agents",
    featured: true,
    href: "https://eve.dev/",
    label: "eve",
    logo: <LogoEve height={16} />,
  },
  { href: "https://nextjs.org/", label: "Next.js", section: "Frameworks" },
  { href: "https://svelte.dev/", label: "Svelte", section: "Frameworks" },
  { href: "https://nuxt.com/", label: "Nuxt", section: "Frameworks" },
  { href: "https://nitro.build/", label: "Nitro", section: "Frameworks" },
  { href: "https://ai-sdk.dev/", label: "AI SDK", section: "SDKs" },
  { href: "https://chat-sdk.dev/", label: "Chat SDK", section: "SDKs" },
  { href: "https://workflow-sdk.dev/", label: "Workflow SDK", section: "SDKs" },
  { href: "https://turborepo.dev/", label: "Turborepo", section: "Other" },
  { href: "https://ui.shadcn.com/", label: "Shadcn", section: "Other" },
  { href: "https://swr.vercel.app/", label: "SWR", section: "Other" },
  { href: "https://justbash.dev/", label: "just-bash", section: "Other" },
];

export const config = defineConfig({
  title,
  agent,
  defaultLanguage: "en",
  logo: <Logo />,
  github,
  nav,
  navbarOssProducts,
  basePath,
  siteId,
  translations,
  content: [{ id: "docs", label: "Docs", dir: "content/docs", route: "/docs" }],
  ai: {
    prompt,
    suggestions,
  },
});
