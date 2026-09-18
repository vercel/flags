import type { Metadata } from 'next';
import { TrustPageContent } from '@/components/custom/trust-page';
import { config } from '@/lib/geistdocs/config';
import { getRootLang } from '@/lib/geistdocs/root-params';
import { buildTrustPageMetadata } from '@/lib/site/trust-page-metadata';
import { ABOUT_PAGE } from '@/lib/site/trust-pages';

export const generateMetadata = async ({
  params,
}: PageProps<'/[lang]/about'>): Promise<Metadata> => {
  const { lang } = await params;
  return buildTrustPageMetadata({
    lang,
    page: ABOUT_PAGE,
    siteUrl: config.siteUrl,
  });
};

export default async function AboutPage() {
  const lang = await getRootLang();
  return <TrustPageContent lang={lang} page={ABOUT_PAGE} />;
}
