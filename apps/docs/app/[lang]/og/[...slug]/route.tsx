import type { NextRequest } from "next/server";
import { getPageImage, source } from "@/lib/geistdocs/source";
import { renderOgImage } from "@/lib/site/og-image";

export const GET = async (
  _request: NextRequest,
  { params }: RouteContext<"/[lang]/og/[...slug]">
) => {
  const { slug, lang } = await params;
  const page = source.getPage(slug.slice(0, -1), lang);

  if (!page) {
    return new Response("Not found", { status: 404 });
  }

  const { title, description } = page.data;

  return renderOgImage({ title, description });
};

export const generateStaticParams = async ({
  params,
}: RouteContext<"/[lang]/og/[...slug]">) => {
  const { lang } = await params;

  return source.getPages(lang).map((page) => ({
    lang: page.locale,
    slug: getPageImage(page).segments,
  }));
};
