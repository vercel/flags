import { agent, github } from '@/geistdocs';

export const GITHUB_URL = `https://github.com/${github.owner}/${github.repo}`;
export const GITHUB_ISSUES_URL = `${GITHUB_URL}/issues`;
export const NPM_URL = 'https://www.npmjs.com/package/flags';
export const SECURITY_POLICY_URL =
  'https://vercel.com/.well-known/security.txt';
export const SECURITY_EMAIL = 'responsible.disclosure@vercel.com';
export const PRIVACY_POLICY_URL = 'https://vercel.com/legal/privacy-policy';
export const VERCEL_CONTACT_URL = 'https://vercel.com/contact';
export const VERCEL_HELP_URL = 'https://vercel.com/help';

export const ORGANIZATION = {
  name: 'Vercel Inc.',
  url: 'https://vercel.com/',
  logo: 'https://lishhsx6kmthaacj.public.blob.vercel-storage.com/vercel-wordmark.svg',
  address: {
    streetAddress: '440 N Barranca Ave #4133',
    addressLocality: 'Covina',
    addressRegion: 'CA',
    postalCode: '91723',
    addressCountry: 'US',
  },
  sameAs: [
    'https://x.com/vercel',
    'https://github.com/vercel',
    'https://www.linkedin.com/company/vercel/',
    'https://en.wikipedia.org/wiki/Vercel',
  ],
} as const;

export const getOrganizationStructuredData = ({
  siteUrl,
}: {
  siteUrl: string;
}) => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${ORGANIZATION.url}#organization`,
  name: ORGANIZATION.name,
  legalName: ORGANIZATION.name,
  url: ORGANIZATION.url,
  logo: {
    '@type': 'ImageObject',
    url: ORGANIZATION.logo,
  },
  sameAs: [...ORGANIZATION.sameAs],
  contactPoint: [
    {
      '@type': 'ContactPoint',
      contactType: 'Customer Support',
      url: VERCEL_CONTACT_URL,
      availableLanguage: ['English'],
    },
    {
      '@type': 'ContactPoint',
      contactType: 'Technical Support',
      url: GITHUB_ISSUES_URL,
      availableLanguage: ['English'],
    },
    {
      '@type': 'ContactPoint',
      contactType: 'Security',
      email: SECURITY_EMAIL,
      url: SECURITY_POLICY_URL,
      availableLanguage: ['English'],
    },
  ],
  address: {
    '@type': 'PostalAddress',
    ...ORGANIZATION.address,
  },
  owns: {
    '@type': 'SoftwareApplication',
    name: agent.product.name,
    url: siteUrl,
  },
});

export const serializeStructuredData = (data: unknown) =>
  JSON.stringify(data).replace(/</g, '\\u003c');
