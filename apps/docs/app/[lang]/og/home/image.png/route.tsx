import { i18n } from "@/lib/geistdocs/i18n";
import { HOME_DESCRIPTION } from "@/lib/site/home-metadata";
import { renderOgImage } from "@/lib/site/og-image";

export const generateStaticParams = () =>
  i18n.languages.map((lang) => ({ lang }));

export const GET = () =>
  renderOgImage({ title: "Flags SDK", description: HOME_DESCRIPTION });
