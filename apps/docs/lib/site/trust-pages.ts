import {
  GITHUB_ISSUES_URL,
  GITHUB_URL,
  NPM_URL,
  ORGANIZATION,
  PRIVACY_POLICY_URL,
  SECURITY_EMAIL,
  SECURITY_POLICY_URL,
  VERCEL_CONTACT_URL,
  VERCEL_HELP_URL,
} from './organization';

export interface TrustPageLink {
  label: string;
  href: string;
  description: string;
}

export interface TrustPageSection {
  heading: string;
  paragraphs: string[];
  links?: TrustPageLink[];
}

export interface TrustPage {
  path: '/about' | '/contact';
  title: string;
  description: string;
  sections: TrustPageSection[];
}

const postalAddress = `${ORGANIZATION.name}, ${ORGANIZATION.address.streetAddress}, ${ORGANIZATION.address.addressLocality}, ${ORGANIZATION.address.addressRegion} ${ORGANIZATION.address.postalCode}, ${ORGANIZATION.address.addressCountry}`;

export const ABOUT_PAGE: TrustPage = {
  path: '/about',
  title: 'About the Flags SDK',
  description:
    'What the Flags SDK is, who maintains it, and how it relates to Vercel Flags and other feature flag providers.',
  sections: [
    {
      heading: 'What it is',
      paragraphs: [
        'The Flags SDK is a free, open-source library for using feature flags in Next.js and SvelteKit. It sits between your application and the source of your flags, so you can define flags as code, evaluate them on the server, and keep your pages fast.',
        'The SDK does not store flag definitions itself. It connects to a flag provider through an adapter, or you write the decision logic directly in your code. This keeps the SDK small and lets you change providers without rewriting your application.',
      ],
    },
    {
      heading: 'Who maintains it',
      paragraphs: [
        `The Flags SDK is built and maintained by ${ORGANIZATION.name}, the company behind Vercel Flags, Next.js, and Turborepo. The source code is published under the MIT license on GitHub, and every release is published to npm as the flags package together with the @flags-sdk/* adapter packages.`,
        'Contributions are welcome. Open a pull request or an issue on GitHub if you find a bug, want to add an adapter, or want to improve the documentation.',
      ],
      links: [
        {
          label: 'Source code',
          href: GITHUB_URL,
          description: 'vercel/flags on GitHub, MIT licensed.',
        },
        {
          label: 'npm package',
          href: NPM_URL,
          description: 'Install with npm i flags.',
        },
      ],
    },
    {
      heading: 'Where to go next',
      paragraphs: [
        'Start with the framework guides to add your first flag, read the principles to understand how the SDK approaches flags as code, and browse the provider list to connect the SDK to the flag service you already use.',
      ],
      links: [
        {
          label: 'Next.js guide',
          href: '/docs/frameworks/next',
          description: 'Add feature flags to a Next.js application.',
        },
        {
          label: 'SvelteKit guide',
          href: '/docs/frameworks/sveltekit',
          description: 'Add feature flags to a SvelteKit application.',
        },
        {
          label: 'Providers',
          href: '/docs/providers',
          description:
            'Adapters for Vercel Flags, LaunchDarkly, Statsig, PostHog, and more.',
        },
      ],
    },
  ],
};

export const CONTACT_PAGE: TrustPage = {
  path: '/contact',
  title: 'Contact',
  description:
    'How to report a bug, ask a question, report a security issue, or reach Vercel about the Flags SDK.',
  sections: [
    {
      heading: 'Bugs, questions, and feature requests',
      paragraphs: [
        'The Flags SDK is developed in the open on GitHub. Open an issue for bugs, unexpected behavior, or feature requests. Include the SDK version, the framework and version you use, and a minimal reproduction so maintainers can help quickly.',
        'For questions about how to use the SDK, read the documentation first. Every documentation page is also available as Markdown by adding .md to its URL, and the Ask AI button on each page answers questions from the documentation.',
      ],
      links: [
        {
          label: 'Open an issue',
          href: GITHUB_ISSUES_URL,
          description:
            'Bug reports and feature requests for the SDK and adapters.',
        },
        {
          label: 'Documentation',
          href: '/docs/frameworks/next',
          description: 'Guides, principles, providers, and API reference.',
        },
      ],
    },
    {
      heading: 'Security issues',
      paragraphs: [
        `Do not report security vulnerabilities in public issues. Follow the Vercel security policy and send reports to ${SECURITY_EMAIL} or through the HackerOne program listed in the policy.`,
      ],
      links: [
        {
          label: 'Security policy',
          href: SECURITY_POLICY_URL,
          description:
            'Responsible disclosure contact and policy for Vercel open-source projects.',
        },
      ],
    },
    {
      heading: 'Vercel Flags and Vercel accounts',
      paragraphs: [
        'Vercel Flags is the hosted feature flag product on Vercel. For billing, account, or product questions about Vercel Flags, contact Vercel support from your dashboard or the Vercel contact page. The Flags SDK GitHub repository is for the open-source library only.',
      ],
      links: [
        {
          label: 'Vercel support',
          href: VERCEL_HELP_URL,
          description: 'Help center and support for Vercel customers.',
        },
        {
          label: 'Contact Vercel',
          href: VERCEL_CONTACT_URL,
          description: 'Sales and general inquiries.',
        },
      ],
    },
    {
      heading: 'Company',
      paragraphs: [
        `This site is operated by ${postalAddress}. Personal data is handled according to the Vercel privacy policy.`,
      ],
      links: [
        {
          label: 'Privacy policy',
          href: PRIVACY_POLICY_URL,
          description: 'How Vercel collects and uses personal data.',
        },
      ],
    },
  ],
};

export const TRUST_PAGES = [ABOUT_PAGE, CONTACT_PAGE] as const;

export const getTrustPageTextLength = (page: TrustPage) =>
  page.sections
    .flatMap((section) => [
      section.heading,
      ...section.paragraphs,
      ...(section.links ?? []).flatMap((link) => [
        link.label,
        link.description,
      ]),
    ])
    .join(' ').length;
