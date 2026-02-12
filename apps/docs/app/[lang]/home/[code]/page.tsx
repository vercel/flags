import { ButtonLink, CodeBlock, Grid, Snippet } from '@vercel/geist/components';
import { ArrowRight } from 'lucide-react';
import { generatePermutations } from 'flags/next';
import { FlagValues } from 'flags/react';
import type { Metadata } from 'next';
import HeroImage from './components/hero-image';
import {
  Adaptable,
  Effortless,
  Flexible,
} from './components/illustrations';
import Testimonials from './components/testimonials';
import {
  enableBannerFlag,
  enableDitheredHeroFlag,
  enableHeroTextFlag,
  rootFlags,
} from '@/flags';
import { FlagSelect, FlagToggle } from './toggles';

const FEATURES = [
  {
    title: 'Works with any provider',
    description:
      'Use any flag provider, or none at all. Flexible integrations for your projects.',
    illustration: <Flexible />,
  },
  {
    title: 'Effortless integration',
    description:
      'Integrate with App Router, Pages Router, and Routing Middleware.',
    illustration: <Effortless />,
  },
  {
    title: 'Release strategically',
    description:
      'Ideal for A/B testing and controlled rollouts. Experiment with confidence.',
    illustration: <Adaptable />,
  },
];

const flagsSetupCodeblock = `import { flag } from 'flags/next';

export const exampleFlag = flag({
  key: 'example-flag',
  decide() {
    return Math.random() > 0.5;
  },
});`;

const flagsImportCodeblock = `import { exampleFlag } from "../flags";

export default async function Page() {
  const example = await exampleFlag();

  return <div>Flag {example ? "on" : "off"}</div>;
}
  `;

export async function generateStaticParams() {
  const codes = await generatePermutations(rootFlags);
  return codes.map((code) => ({ code }));
}

export const metadata: Metadata = {
  alternates: { canonical: 'https://flags-sdk.dev' },
};

export default async function HomePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const [bannerFlag, ditheredHeroFlag, heroTextFlag] = await Promise.all([
    enableBannerFlag(code, rootFlags),
    enableDitheredHeroFlag(code, rootFlags),
    enableHeroTextFlag(code, rootFlags),
  ]);

  return (
    <div className="py-12">
      <FlagValues
        values={{
          [enableBannerFlag.key]: bannerFlag,
          [enableDitheredHeroFlag.key]: ditheredHeroFlag,
          [enableHeroTextFlag.key]: heroTextFlag,
        }}
      />
      <Grid.System>
        <Grid
          hideGuides
          columns={{
            sm: 1,
            md: 1,
            lg: 2,
          }}
          rows={{
            sm: 2,
            md: 2,
            lg: 1,
          }}
        >
          <Grid.Cross />
          <Grid.Cell className="relative sm:!mb-0">
            <div className="flex flex-col justify-center">
              <h1 className="mb-2.5 text-heading-48 md:text-heading-64">
                {heroTextFlag}
              </h1>
              <p className="mb-6 font-medium text-gray-900 text-label-20 md:mb-12">
                Flags SDK is a free, open-source library for using feature flags
                in Next.js and SvelteKit.
              </p>
              <div className="flex h-fit gap-x-4">
                <ButtonLink
                  size={{
                    sm: 'medium',
                    md: 'large',
                  }}
                  href="/frameworks/next"
                >
                  Get Started
                </ButtonLink>
                <Snippet
                  text="npm i flags"
                  className="flex h-fit items-center justify-center font-mono"
                />
              </div>
            </div>
          </Grid.Cell>
          <Grid.Cell className="relative sm:!mb-0">
            {ditheredHeroFlag ? (
              <HeroImage />
            ) : (
              <div
                className="absolute inset-0 h-full w-full max-[960px]:border-l-0 max-[960px]:border-t min-[960px]:m-0 min-[960px]:h-fit min-[960px]:border-l"
                style={{
                  zIndex: -10,
                  backgroundColor: 'var(--ds-background-100)',
                  backgroundImage: `linear-gradient(to top, var(--ds-background-200) 0%, rgba(255,255,255,0) 100%),
                  linear-gradient(to right, var(--ds-gray-300) 0.5px, transparent 1px),
                  linear-gradient(to bottom, var(--ds-gray-300) 0.5px, transparent 1px)`,
                  backgroundSize:
                    '100% 100%, 5.625rem 5.625rem, 5.625rem 5.625rem',
                  backgroundPosition:
                    'bottom, top -1px left -1px, top -1px left -1px',
                  backgroundRepeat: 'no-repeat, repeat, repeat',
                }}
              />
            )}

            <div className="rounded-xl bg-background-100 p-4 shadow-md ring-1 ring-[var(--ds-gray-alpha-400)] md:p-6">
              <div className="flex flex-col gap-y-1 px-2">
                <div className="mb-0.5 text-heading-20">Try the Flags SDK</div>
                <span className="text-gray-900 text-label-16">
                  Set persistent flags for this page
                </span>
              </div>
              <div className="divide-y">
                <FlagToggle
                  value={ditheredHeroFlag}
                  flagKey={enableDitheredHeroFlag.key}
                  label={enableDitheredHeroFlag.key}
                  description={enableDitheredHeroFlag.description}
                />
                <FlagSelect
                  value={heroTextFlag}
                  flagKey={enableHeroTextFlag.key}
                  label={enableHeroTextFlag.key}
                  description={enableHeroTextFlag.description}
                  options={enableHeroTextFlag.options}
                />
                <FlagToggle
                  value={bannerFlag}
                  flagKey={enableBannerFlag.key}
                  label={enableBannerFlag.key}
                  description={enableBannerFlag.description}
                  scroll
                />
              </div>
            </div>
          </Grid.Cell>
        </Grid>
        <Grid columns={1} rows={3}>
          <Grid.Cell className="h-fit">
            <h2 className="mb-1 text-heading-32">Using flags as code</h2>
            <p className="max-w-prose text-balance text-gray-900 text-copy-16">
              The SDK sits between your application and the source of your
              flags, helping you follow best practices and keep your website
              fast.
            </p>
            <div className="my-8 grid h-fit gap-y-8 md:grid-cols-3 md:gap-x-8">
              {FEATURES.map((feature) => (
                <div key={feature.title}>
                  <div className="flex items-center justify-center">
                    {feature.illustration}
                  </div>
                  <h3 className="mt-3 text-heading-24 md:mt-6">
                    {feature.title}
                  </h3>
                  <p className="mt-1.5 text-gray-900 text-copy-16 md:mt-4">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </Grid.Cell>
          <Grid.Cell className="h-fit bg-background-100">
            <div className="flex flex-col items-start justify-between gap-y-4 md:flex-row">
              <div className="flex flex-col gap-y-1">
                <h2 className="text-heading-32">Effortless setup</h2>
                <p className="text-gray-900 text-copy-16">
                  With a simple declarative API to define and use your feature
                  flags.
                </p>
              </div>
              <ButtonLink
                href={'/frameworks/next'}
                type="secondary"
                suffix={<ArrowRight />}
              >
                Read the Docs
              </ButtonLink>
            </div>
            <div className="mt-4 grid w-full grid-cols-1 gap-x-4 md:grid-cols-2">
              <div>
                <CodeBlock
                  aria-label="Method of setting up flags in your project"
                  filename="flags.ts"
                  language="next"
                  className="!mb-0.5"
                >
                  {flagsSetupCodeblock}
                </CodeBlock>
                <span className="text-xs text-gray-900">Declaring a flag</span>
              </div>
              <div>
                <CodeBlock
                  aria-label="Showcasing how to import a flag into your page or layout"
                  filename="app/page.tsx"
                  language="next"
                  className="!mb-0.5"
                >
                  {flagsImportCodeblock}
                </CodeBlock>
                <span className="text-xs text-gray-900">Using a flag</span>
              </div>
            </div>
          </Grid.Cell>
          <Grid.Cell className="h-fit">
            <h2 className="mb-1 text-heading-32">
              What builders say about the Flags SDK
            </h2>

            <Testimonials />
          </Grid.Cell>
        </Grid>
        <Grid columns={1} rows={1}>
          <Grid.Cell>
            <div className="flex flex-col items-start gap-y-6 md:flex-row md:items-center md:justify-between md:gap-x-6">
              <h2 className="text-heading-32 md:text-heading-40">
                Deploy your first flag today.
              </h2>
              <div className="flex gap-x-4">
                <ButtonLink
                  size={{
                    sm: 'medium',
                    md: 'large',
                  }}
                  href="/frameworks/next"
                >
                  Get Started
                </ButtonLink>
                <Snippet
                  text="npm i flags"
                  className="flex h-fit items-center justify-center font-mono"
                />
              </div>
            </div>
          </Grid.Cell>
        </Grid>
      </Grid.System>
    </div>
  );
}
