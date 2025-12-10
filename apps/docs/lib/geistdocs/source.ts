import { type InferPageType, loader, Source } from "fumadocs-core/source";
import { lucideIconsPlugin } from "fumadocs-core/source/lucide-icons";
import {
  apiReference as apiReferenceServer,
  frameworks as frameworksServer,
  principles as principlesServer,
  providers as providersServer,
} from "@/.source/server";
import { basePath } from "@/geistdocs";
import { i18n } from "./i18n";

// See https://fumadocs.dev/docs/headless/source-api for more info
export const apiReference = loader({
  i18n,
  baseUrl: "/api-reference",
  source: apiReferenceServer.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

export const frameworks = loader({
  i18n,
  baseUrl: "/frameworks",
  source: frameworksServer.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

export const principles = loader({
  i18n,
  baseUrl: "/principles",
  source: principlesServer.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

export const providers = loader({
  i18n,
  baseUrl: "/providers",
  source: providersServer.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

export const source = loader({
  i18n,
  baseUrl: "/",
  source: {
    files: [
      ...apiReferenceServer.toFumadocsSource().files,
      ...frameworksServer.toFumadocsSource().files,
      ...principlesServer.toFumadocsSource().files,
      ...providersServer.toFumadocsSource().files,
    ],
  } as Source,
  plugins: [lucideIconsPlugin()],
});

export const getPageImage = (page: InferPageType<typeof apiReference | typeof frameworks | typeof principles | typeof providers>) => {
  const segments = [...page.slugs, "image.png"];

  return {
    segments,
    url: basePath
      ? `${basePath}/og/${segments.join("/")}`
      : `/og/${segments.join("/")}`,
  };
};

export const getLLMText = async (page: InferPageType<typeof apiReference | typeof frameworks | typeof principles | typeof providers>) => {
  const processed = await page.data.getText("processed");

  return `# ${page.data.title}

${processed}`;
};
