import type { Metadata } from 'next';
import Link from 'next/link';
import { config } from '@/lib/geistdocs/config';
import { getLocalizedPath } from '@/lib/geistdocs/public-path';
import { getRootLang } from '@/lib/geistdocs/root-params';
import {
  GITHUB_ISSUES_URL,
  ORGANIZATION,
  PRIVACY_POLICY_URL,
  SECURITY_EMAIL,
  SECURITY_POLICY_URL,
  VERCEL_CONTACT_URL,
  VERCEL_HELP_URL,
} from '@/lib/site/organization';

const TITLE = 'Contact | Flags SDK';
const DESCRIPTION =
  'How to report a bug, ask a question, report a security issue, or reach Vercel about the Flags SDK.';

export const generateMetadata = async ({
  params,
}: PageProps<'/[lang]/contact'>): Promise<Metadata> => {
  const { lang } = await params;
  const path = getLocalizedPath(lang, '/contact');

  return {
    title: TITLE,
    description: DESCRIPTION,
    ...(config.siteUrl ? { alternates: { canonical: path } } : {}),
    openGraph: {
      type: 'website',
      title: TITLE,
      description: DESCRIPTION,
      url: path,
      siteName: 'Flags SDK',
    },
  };
};

const { address } = ORGANIZATION;

export default async function ContactPage() {
  const lang = await getRootLang();

  return (
    <main className="mx-auto grid w-full max-w-2xl gap-10 px-6 pt-(--fd-nav-height) pb-32">
      <header className="grid gap-3 pt-16">
        <h1 className="font-[450] text-4xl tracking-tight">Contact</h1>
        <p className="text-gray-900 text-lg">{DESCRIPTION}</p>
      </header>

      <section className="grid gap-3">
        <h2 className="text-heading-20">
          Bugs, questions, and feature requests
        </h2>
        <p className="text-gray-900 leading-relaxed">
          The Flags SDK is developed in the open on GitHub. Open an issue for
          bugs, unexpected behavior, or feature requests. Include the SDK
          version, the framework and version you use, and a minimal reproduction
          so maintainers can help quickly.
        </p>
        <p className="text-gray-900 leading-relaxed">
          For questions about how to use the SDK, read the{' '}
          <Link
            className="underline"
            href={getLocalizedPath(lang, '/docs/frameworks/next')}
            prefetch={true}
          >
            documentation
          </Link>{' '}
          first. Every page is also available as Markdown by adding .md to its
          URL, and the Ask AI button on each page answers questions from the
          documentation.
        </p>
        <p>
          <Link className="underline" href={GITHUB_ISSUES_URL} rel="noopener">
            Open an issue on GitHub
          </Link>
        </p>
      </section>

      <section className="grid gap-3">
        <h2 className="text-heading-20">Security issues</h2>
        <p className="text-gray-900 leading-relaxed">
          Do not report security vulnerabilities in public issues. Follow the{' '}
          <Link className="underline" href={SECURITY_POLICY_URL} rel="noopener">
            Vercel security policy
          </Link>{' '}
          and send reports to{' '}
          <Link className="underline" href={`mailto:${SECURITY_EMAIL}`}>
            {SECURITY_EMAIL}
          </Link>{' '}
          or through the HackerOne program listed in the policy.
        </p>
      </section>

      <section className="grid gap-3">
        <h2 className="text-heading-20">Vercel Flags and Vercel accounts</h2>
        <p className="text-gray-900 leading-relaxed">
          Vercel Flags is the hosted feature flag product on Vercel. For
          billing, account, or product questions about Vercel Flags, use{' '}
          <Link className="underline" href={VERCEL_HELP_URL} rel="noopener">
            Vercel support
          </Link>{' '}
          or the{' '}
          <Link className="underline" href={VERCEL_CONTACT_URL} rel="noopener">
            Vercel contact page
          </Link>
          . The Flags SDK GitHub repository is for the open-source library only.
        </p>
      </section>

      <section className="grid gap-3">
        <h2 className="text-heading-20">Company</h2>
        <p className="text-gray-900 leading-relaxed">
          This site is operated by {ORGANIZATION.name}, {address.streetAddress},{' '}
          {address.addressLocality}, {address.addressRegion}{' '}
          {address.postalCode}, {address.addressCountry}. Personal data is
          handled according to the{' '}
          <Link className="underline" href={PRIVACY_POLICY_URL} rel="noopener">
            Vercel privacy policy
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
