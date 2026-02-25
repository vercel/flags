import "../global.css";
import { VercelToolbar } from '@vercel/toolbar/next';
import { Footer } from "@/components/geistdocs/footer";
import { Navbar } from "@/components/geistdocs/navbar";
import { GeistdocsProvider } from "@/components/geistdocs/provider";
import { basePath } from "@/geistdocs";
import { mono, sans } from "@/lib/geistdocs/fonts";
import { cn } from "@/lib/utils";
import { translations } from "@/geistdocs";

export const generateStaticParams = async () => {
  const langs = Object.keys(translations);
  return langs.map((lang) => ({ lang }));
};

const Layout = async ({ children, params }: LayoutProps<"/[lang]">) => {
  const { lang } = await params;
  const shouldInjectToolbar = process.env.NODE_ENV === 'development';

  return (
    <html
      className={cn(sans.variable, mono.variable, "scroll-smooth antialiased")}
      lang={lang}
      suppressHydrationWarning
    >
      <body>
        <GeistdocsProvider basePath={basePath} lang={lang}>
          <Navbar />
          {children}
          {shouldInjectToolbar && <VercelToolbar />}
          <Footer />
        </GeistdocsProvider>
      </body>
    </html>
  );
};

export default Layout;
