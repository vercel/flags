import { createRelativeLink } from "fumadocs-ui/mdx";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AskAI } from "@/components/geistdocs/ask-ai";
import { CopyPage } from "@/components/geistdocs/copy-page";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "@/components/geistdocs/docs-page";
import { EditSource } from "@/components/geistdocs/edit-source";
import { Feedback } from "@/components/geistdocs/feedback";
import { getMDXComponents } from "@/components/geistdocs/mdx-components";
import { OpenInChat } from "@/components/geistdocs/open-in-chat";
import { ScrollTop } from "@/components/geistdocs/scroll-top";
import { Separator } from "@/components/ui/separator";
import { getLLMText, getPageImage, apiReference, frameworks, principles, providers } from "@/lib/geistdocs/source";
import { IframeBrowser } from "@/components/custom/iframe-browser";
import { LearnMore } from "@/components/custom/learn-more";
import { ProviderList } from "@/components/custom/provider-list";

const sources = {
  "api-reference": apiReference,
  "frameworks": frameworks,
  "principles": principles,
  "providers": providers,
};

const Page = async ({ params }: PageProps<"/[lang]/[docs]/[[...slug]]">) => {
  const { slug, lang, docs } = await params;
  const source = sources[docs as keyof typeof sources];

  if (!source) {
    notFound();
  }

  const page = source.getPage(slug, lang);

  if (!page) {
    notFound();
  }

  const markdown = await getLLMText(page);
  const MDX = page.data.body;

  return (
    <DocsPage
      full={page.data.full}
      tableOfContent={{
        style: "clerk",
        footer: (
          <div className="my-3 space-y-3">
            <Separator />
            <EditSource path={page.path} />
            <ScrollTop />
            <Feedback />
            <CopyPage text={markdown} />
            <AskAI href={page.url} />
            <OpenInChat href={page.url} />
          </div>
        ),
      }}
      toc={page.data.toc}
    >
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX
          components={getMDXComponents({
            a: createRelativeLink(source, page),

            // Add your custom components here
            IframeBrowser,
            LearnMore,
            ProviderList,
          })}
        />
      </DocsBody>
    </DocsPage>
  );
};

export const generateStaticParams = async ({ params }: PageProps<"/[lang]/[docs]/[[...slug]]">) => {
  const { lang, docs } = await params;
  const source = sources[docs as keyof typeof sources];

  if (!source) {
    notFound();
  }

  return source.generateParams(lang);
};

export const generateMetadata = async ({
  params,
}: PageProps<"/[lang]/[docs]/[[...slug]]">) => {
  const { lang, docs } = await params;
  const source = sources[docs as keyof typeof sources];

  if (!source) {
    notFound();
  }

  const page = source.getPage(slug, lang);

  if (!page) {
    notFound();
  }

  const metadata: Metadata = {
    title: page.data.title,
    description: page.data.description,
    openGraph: {
      images: getPageImage(page).url,
    },
  };

  return metadata;
};

export default Page;
