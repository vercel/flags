import { LogoAiElements } from "@vercel/geistdocs/assets/logos/logo-ai-elements";
import { LogoAiSdk } from "@vercel/geistdocs/assets/logos/logo-ai-sdk";
import { LogoChatSdk } from "@vercel/geistdocs/assets/logos/logo-chat-sdk";
import { LogoEve } from "@vercel/geistdocs/assets/logos/logo-eve";
import { LogoWorkflowSdk } from "@vercel/geistdocs/assets/logos/logo-workflow-sdk";
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
  { href: "https://eve.dev/docs", logo: <LogoEve height={12} /> },
  { href: "https://ai-sdk.dev/", logo: <LogoAiSdk height={12} /> },
  { href: "https://chat-sdk.dev/", logo: <LogoChatSdk height={20} /> },
  { href: "https://workflow-sdk.dev/", logo: <LogoWorkflowSdk height={12} /> },
  { href: "https://elements.ai-sdk.dev/", logo: <LogoAiElements height={12} /> },
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
