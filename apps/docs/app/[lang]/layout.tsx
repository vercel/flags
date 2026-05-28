import "../global.css";
import { Footer } from "@vercel/geistdocs/footer";
import { Navbar } from "@vercel/geistdocs/navbar";
import { VercelToolbar } from "@vercel/toolbar/next";
import { GeistdocsProvider } from "@/components/geistdocs/provider";
import { config } from "@/lib/geistdocs/config";
import { mono, sans } from "@/lib/geistdocs/fonts";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = {
  metadataBase: new URL("https://flags-sdk.dev"),
};

export const generateStaticParams = async () => {
  const langs = Object.keys(config.translations ?? {});
  return langs.map((lang) => ({ lang }));
};

const Layout = async ({ children, params }: LayoutProps<"/[lang]">) => {
  const { lang } = await params;
  const shouldInjectToolbar = process.env.NODE_ENV === "development";

  return (
    <html
      className={cn(sans.variable, mono.variable, "antialiased")}
      lang={lang}
      suppressHydrationWarning
    >
      <body>
        <GeistdocsProvider basePath={config.basePath} lang={lang}>
          <Navbar config={config} />
          {children}
          {shouldInjectToolbar && <VercelToolbar />}
          <Footer config={config} />
        </GeistdocsProvider>
      </body>
    </html>
  );
};

export default Layout;
