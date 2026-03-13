import type { NextRequest } from "next/server";
import { getLLMText, source } from "@/lib/geistdocs/source";
import { translations } from "@/geistdocs";

export const revalidate = false;

export const dynamicParams = false;
export const generateStaticParams = async () => {
  const langs = Object.keys(translations);
  return langs.map((lang) => ({ lang }));
};

export const GET = async (
  _req: NextRequest,
  { params }: RouteContext<"/[lang]/llms.txt">
) => {
  const { lang } = await params;
  const scan = source.getPages(lang).map(getLLMText);
  const scanned = await Promise.all(scan);

  return new Response(scanned.join("\n\n"), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
    },
  });
};
