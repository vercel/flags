import type { Metadata } from 'next';
import { getLocalizedPath } from '@/lib/geistdocs/public-path';
import type { TrustPage } from './trust-pages';

export const buildTrustPageMetadata = ({
  lang,
  page,
  siteUrl,
}: {
  lang: string;
  page: TrustPage;
  siteUrl?: string;
}): Metadata => {
  const path = getLocalizedPath(lang, page.path);
  const title = `${page.title} | Flags SDK`;

  return {
    title,
    description: page.description,
    ...(siteUrl ? { alternates: { canonical: path } } : {}),
    openGraph: {
      type: 'website',
      title,
      description: page.description,
      url: path,
      siteName: 'Flags SDK',
    },
  };
};
