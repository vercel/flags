import { createLlmsRoute } from "@vercel/geistdocs/routes/llms";
import { config } from "@/lib/geistdocs/config";
import { geistdocsSource } from "@/lib/geistdocs/source";

const llmsRoute = createLlmsRoute({
  source: geistdocsSource,
});

export const dynamicParams = false;
export const generateStaticParams = () => {
  const langs = Object.keys(config.translations ?? {});
  return langs.map((lang) => ({ lang }));
};

export const GET = llmsRoute.GET;
export const revalidate = false;
