import type { Metadata } from 'next';
import { TrustPageContent } from '@/components/custom/trust-page';
import { config } from '@/lib/geistdocs/config';
import { getRootLang } from '@/lib/geistdocs/root-params';
import { buildTrustPageMetadata } from '@/lib/site/trust-page-metadata';
import { CONTACT_PAGE } from '@/lib/site/trust-pages';

export const generateMetadata = async ({
  params,
}: PageProps<'/[lang]/contact'>): Promise<Metadata> => {
  const { lang } = await params;
  return buildTrustPageMetadata({
    lang,
    page: CONTACT_PAGE,
    siteUrl: config.siteUrl,
  });
};

export default async function ContactPage() {
  const lang = await getRootLang();
  return <TrustPageContent lang={lang} page={CONTACT_PAGE} />;
}
