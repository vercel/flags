import type { Metadata } from 'next';
import { agent } from '@/geistdocs';
import { getLocalizedPath } from '@/lib/geistdocs/public-path';

export const HOME_TITLE = 'Flags SDK: feature flags for Next.js and SvelteKit';
export const HOME_DESCRIPTION = agent.product.description;
export const HOME_OG_IMAGE_PATH = '/og/home/image.png';

export const buildHomeMetadata = ({
  lang,
  siteUrl,
  agentReadinessEnabled,
}: {
  lang: string;
  siteUrl?: string;
  agentReadinessEnabled: boolean;
}): Metadata => {
  const homePath = getLocalizedPath(lang, '/');
  const imagePath = getLocalizedPath(lang, HOME_OG_IMAGE_PATH);

  return {
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    ...(siteUrl
      ? {
          alternates: {
            canonical: homePath,
            ...(agentReadinessEnabled
              ? {
                  types: {
                    'text/markdown': getLocalizedPath(lang, '/agents.md'),
                  },
                }
              : {}),
          },
        }
      : {}),
    openGraph: {
      type: 'website',
      title: HOME_TITLE,
      description: HOME_DESCRIPTION,
      url: homePath,
      siteName: 'Flags SDK',
      images: [{ url: imagePath, width: 1200, height: 628, alt: 'Flags SDK' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: HOME_TITLE,
      description: HOME_DESCRIPTION,
      images: [imagePath],
    },
  };
};
