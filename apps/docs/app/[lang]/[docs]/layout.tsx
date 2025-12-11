import { DocsLayout } from "@/components/geistdocs/docs-layout";
import { apiReference, frameworks, principles, providers } from "@/lib/geistdocs/source";
import { notFound } from "next/navigation";

const sources = {
  "api-reference": apiReference,
  "frameworks": frameworks,
  "principles": principles,
  "providers": providers,
};

const Layout = async ({ children, params }: LayoutProps<"/[lang]/[docs]">) => {
  const { lang, docs } = await params;
  const source = sources[docs as keyof typeof sources];

  if (!source) {
    notFound();
  }

  return <DocsLayout tree={source.pageTree[lang]}>{children}</DocsLayout>;
};

export default Layout;
