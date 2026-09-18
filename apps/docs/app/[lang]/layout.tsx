import "../global.css";
import "@/lib/geistdocs/site-url-warning";
import { Footer } from "@vercel/geistdocs/footer";
import { Navbar } from "@vercel/geistdocs/navbar";
import { VercelToolbar } from "@vercel/toolbar/next";
import type { Metadata } from "next";
import { GeistdocsProvider } from "@/components/geistdocs/provider";
import { config } from "@/lib/geistdocs/config";
import { mono, sans } from "@/lib/geistdocs/fonts";
import { i18n } from "@/lib/geistdocs/i18n";
import { getRootLang } from "@/lib/geistdocs/root-params";
import { isSiteUrlConfigured, siteUrl } from "@/lib/geistdocs/site-url";
import {
  getOrganizationStructuredData,
  serializeStructuredData,
} from "@/lib/site/organization";
import { cn } from "@/lib/utils";

export const generateStaticParams = () =>
  i18n.languages.map((lang) => ({ lang }));

export const metadata: Metadata = {
  metadataBase: isSiteUrlConfigured ? siteUrl : undefined,
};

const Layout = async ({ children }: LayoutProps<"/[lang]">) => {
  const lang = await getRootLang();
  const shouldInjectToolbar = process.env.NODE_ENV === "development";

  return (
    <html
      className={cn(sans.variable, mono.variable, "antialiased")}
      lang={lang}
      suppressHydrationWarning
    >
      <body>
        {isSiteUrlConfigured ? (
          <script
            // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD is serialized and escapes HTML start characters.
            dangerouslySetInnerHTML={{
              __html: serializeStructuredData(
                getOrganizationStructuredData({ siteUrl: siteUrl.toString() })
              ),
            }}
            type="application/ld+json"
          />
        ) : null}
        <GeistdocsProvider basePath={config.basePath} lang={lang}>
          <Navbar config={config} />
          {children}
          {shouldInjectToolbar && <VercelToolbar />}
          <Footer />
        </GeistdocsProvider>
      </body>
    </html>
  );
};

export default Layout;
