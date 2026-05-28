import { MobileDocsBar } from "@vercel/geistdocs/mobile-docs-bar";
import { createDocsPage } from "@vercel/geistdocs/pages/docs";
import { getMDXComponents } from "@/components/geistdocs/mdx-components";
import { IframeBrowser } from "@/components/custom/iframe-browser";
import { LearnMore } from "@/components/custom/learn-more";
import { ProviderList } from "@/components/custom/provider-list";
import { ThemeAwareImage } from "@/components/custom/theme-aware-image";
import { config } from "@/lib/geistdocs/config";
import { geistdocsSource } from "@/lib/geistdocs/source";
import { ExternalLinkIcon } from "lucide-react";

const docsPage = createDocsPage({
  config,
  mdx: ({ link }) =>
    getMDXComponents({
      a: link,
      IframeBrowser,
      LearnMore,
      ProviderList,
      ThemeAwareImage,
      ExternalSmall: ExternalLinkIcon,
    }),
  openGraph: {
    images: true,
  },
  source: geistdocsSource,
  tableOfContentPopover: {
    enabled: false,
  },
  renderTop: ({ data }) => <MobileDocsBar toc={data.toc} />,
});

export default docsPage.Page;
export const generateStaticParams = docsPage.generateStaticParams;
export const generateMetadata = docsPage.generateMetadata;
