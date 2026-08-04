import { Button } from '@vercel/geistdocs/components/button';
import {
  CommandPromptContent,
  CommandPromptCopy,
  CommandPromptPrefix,
  CommandPromptRoot,
  CommandPromptSurface,
  CommandPromptViewport,
} from '@vercel/geistdocs/components/command-prompt';
import { generatePermutations } from 'flags/next';
import { FlagValues } from 'flags/react';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  enableBannerFlag,
  enableDitheredHeroFlag,
  enableHeroTextFlag,
  installAudienceFlag,
  rootFlags,
} from '@/flags';
import HeroImage from './components/hero-image';
import { Adaptable, Effortless, Flexible } from './components/illustrations';
import Testimonials from './components/testimonials';
import { HighlightedCode } from './highlighted-code';
import { InstallCommand } from './install-command';
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
}`;

export const dynamicParams = false; // all combinations are known upfront here
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
  const [bannerFlag, ditheredHeroFlag, heroTextFlag, installAudience] =
    await Promise.all([
      enableBannerFlag(code, rootFlags),
      enableDitheredHeroFlag(code, rootFlags),
      enableHeroTextFlag(code, rootFlags),
      installAudienceFlag(code, rootFlags),
    ]);

  return (
    <div className="mx-auto w-full max-w-[1448px] px-4 sm:px-6">
      <FlagValues
        values={{
          [enableBannerFlag.key]: bannerFlag,
          [enableDitheredHeroFlag.key]: ditheredHeroFlag,
          [enableHeroTextFlag.key]: heroTextFlag,
          [installAudienceFlag.key]: installAudience,
        }}
      />

      {/* Hero */}

      <section className="mt-(--fd-nav-height) grid grid-cols-12 gap-y-12 pt-16 pb-16 sm:pt-40 lg:gap-x-12">
        <div className="col-span-12 flex flex-col justify-center lg:col-span-7">
          <h1 className="text-balance text-heading-40 sm:text-heading-48 xl:text-heading-64 max-w-md">
            {heroTextFlag}
          </h1>
          <p className="mt-5 max-w-xl text-balance text-gray-900 leading-relaxed text-copy-18">
            Flags SDK is a free, open-source library for using feature flags in
            Next.js and SvelteKit.
          </p>
          <InstallCommand
            flagKey={installAudienceFlag.key}
            value={installAudience}
          />
        </div>
        <div className="relative col-span-12 lg:col-span-5 p-4">
          {ditheredHeroFlag ? <HeroImage /> : null}

          <div className="relative rounded-xl bg-background-100 p-4 md:p-6 shadow-(--ds-shadow-menu)">
            <div className="flex flex-col gap-y-1 px-2">
              <div className="mb-0.5 text-heading-20">Try the Flags SDK</div>
              <span className="text-gray-900 text-sm">
                Set persistent flags for this page
              </span>
            </div>
            <div className="divide-y">
              <FlagToggle
                value={bannerFlag}
                flagKey={enableBannerFlag.key}
                label={enableBannerFlag.key}
                description={enableBannerFlag.description}
                scroll
              />
              <FlagSelect
                value={heroTextFlag}
                flagKey={enableHeroTextFlag.key}
                label={enableHeroTextFlag.key}
                description={enableHeroTextFlag.description}
                options={enableHeroTextFlag.options}
              />
              <FlagToggle
                value={ditheredHeroFlag}
                flagKey={enableDitheredHeroFlag.key}
                label={enableDitheredHeroFlag.key}
                description={enableDitheredHeroFlag.description}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Sections */}
      <div className="grid">
        {/* Features */}
        <div className="grid gap-8 py-8 sm:py-20">
          <div className="grid max-w-3xl gap-2 text-balance">
            <h2 className="text-heading-20 sm:text-heading-24 md:text-heading-32 lg:text-heading-40">
              Using flags as code
            </h2>
            <p className="text-lg text-gray-900">
              The SDK sits between your application and the source of your
              flags, helping you follow best practices and keep your website
              fast.
            </p>
          </div>
          <div className="grid gap-6 md:gap-20 md:grid-cols-3">
            {FEATURES.map((feature) => (
              <div key={feature.title}>
                <div className="flex items-center justify-center">
                  {feature.illustration}
                </div>
                <h3 className="mt-3 text-heading-20 md:mt-6">
                  {feature.title}
                </h3>
                <p className="mt-1.5 text-gray-900 md:mt-4">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Code examples */}
        <div className="grid gap-8 py-8 sm:py-12">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div className="grid max-w-3xl gap-2 text-balance">
              <h2 className="text-heading-20 sm:text-heading-24 md:text-heading-32">
                Effortless setup
              </h2>
              <p className="text-lg text-gray-900">
                With a simple declarative API to define and use your feature
                flags.
              </p>
            </div>
            <Button
              variant="outline"
              size="lg"
              className="shrink-0 rounded-full"
              asChild
            >
              <Link href="/frameworks/next">Read the Docs</Link>
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-6 md:gap-20 md:grid-cols-2">
            <HighlightedCode
              code={flagsSetupCodeblock}
              lang="typescript"
              filename="flags.ts"
              caption="Declaring a flag"
            />
            <HighlightedCode
              code={flagsImportCodeblock}
              lang="tsx"
              filename="app/page.tsx"
              caption="Using a flag"
            />
          </div>
        </div>

        {/* Testimonials */}
        <div className="grid gap-8 py-8 sm:py-12">
          <div className="grid max-w-3xl gap-2 text-balance">
            <h2 className="text-heading-20 sm:text-heading-24 md:text-heading-32 lg:text-heading-40">
              What builders say about the Flags SDK
            </h2>
          </div>
          <Testimonials />
        </div>

        {/* CTA */}
        <section className="flex flex-col gap-4 py-10 md:flex-row md:items-center md:justify-between">
          <h2 className="text-heading-20 sm:text-heading-24 md:text-heading-32 lg:text-heading-40">
            Deploy your first flag today
          </h2>
          {/* Stack until the section itself goes side-by-side at md, and keep
              the buttons on the heading's left edge while stacked. */}
          <div className="flex flex-col items-start gap-3 md:flex-row md:items-center">
            <Button size="lg" asChild className="rounded-full">
              <Link href="/frameworks/next">Get Started</Link>
            </Button>
            {/* Root is `w-full items-center` by default, which would centre the
                pill against the left-aligned heading while stacked. */}
            <CommandPromptRoot className="items-start" defaultValue="install">
              {/* Match the adjacent Get Started button's h-10. */}
              <CommandPromptSurface className="h-10 py-0 pr-2">
                <CommandPromptPrefix>$</CommandPromptPrefix>
                <CommandPromptViewport>
                  <CommandPromptContent copyValue="npm i flags" value="install">
                    npm i flags
                  </CommandPromptContent>
                </CommandPromptViewport>
                <CommandPromptCopy />
              </CommandPromptSurface>
            </CommandPromptRoot>
          </div>
        </section>
      </div>
    </div>
  );
}
