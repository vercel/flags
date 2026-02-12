import { ArrowRight } from 'lucide-react';
import { generatePermutations } from 'flags/next';
import { FlagValues } from 'flags/react';
import type { Metadata } from 'next';
import Link from 'next/link';
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
import { Button } from '@/components/ui/button';
import { FlagSelect, FlagToggle } from './toggles';
import { CopySnippet } from './copy-snippet';
import { HighlightedCode } from './highlighted-code';

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
    <div className="container mx-auto max-w-5xl">
      <FlagValues
        values={{
          [enableBannerFlag.key]: bannerFlag,
          [enableDitheredHeroFlag.key]: ditheredHeroFlag,
          [enableHeroTextFlag.key]: heroTextFlag,
        }}
      />

      {/* Hero */}
      <section className="mt-(--fd-nav-height) grid grid-cols-1 gap-12 px-4 pt-16 pb-16 sm:pt-24 lg:grid-cols-2">
        <div className="flex flex-col justify-center">
          <h1 className="text-balance font-semibold text-[40px] leading-[1.1] tracking-tight sm:text-5xl xl:text-6xl">
            {heroTextFlag}
          </h1>
          <p className="mt-5 max-w-3xl text-balance text-muted-foreground leading-relaxed sm:text-xl">
            Flags SDK is a free, open-source library for using feature flags
            in Next.js and SvelteKit.
          </p>
          <div className="mt-6 inline-flex w-fit items-center gap-3">
            <Button size="lg" asChild>
              <Link href="/frameworks/next">Get Started</Link>
            </Button>
            <CopySnippet text="npm i flags" />
          </div>
        </div>
        <div className="relative">
          {ditheredHeroFlag ? (
            <HeroImage />
          ) : (
            <div
              className="absolute inset-0 h-full w-full lg:border-l"
              style={{
                zIndex: -10,
                backgroundColor: 'var(--background)',
                backgroundImage: `linear-gradient(to top, var(--muted) 0%, rgba(255,255,255,0) 100%),
                linear-gradient(to right, var(--border) 0.5px, transparent 1px),
                linear-gradient(to bottom, var(--border) 0.5px, transparent 1px)`,
                backgroundSize:
                  '100% 100%, 5.625rem 5.625rem, 5.625rem 5.625rem',
                backgroundPosition:
                  'bottom, top -1px left -1px, top -1px left -1px',
                backgroundRepeat: 'no-repeat, repeat, repeat',
              }}
            />
          )}

          <div className="rounded-xl border bg-background p-4 shadow-md md:p-6">
            <div className="flex flex-col gap-y-1 px-2">
              <div className="mb-0.5 font-semibold text-lg tracking-tight">Try the Flags SDK</div>
              <span className="text-muted-foreground text-sm">
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
        </div>
      </section>

      {/* Sections with dividers */}
      <div className="grid divide-y border-y sm:border-x">

        {/* Features */}
        <div className="grid gap-8 px-4 py-8 sm:px-12 sm:py-12">
          <div className="grid max-w-3xl gap-2 text-balance">
            <h2 className="font-semibold text-xl tracking-tight sm:text-2xl md:text-3xl lg:text-[40px]">
              Using flags as code
            </h2>
            <p className="text-lg text-muted-foreground">
              The SDK sits between your application and the source of your
              flags, helping you follow best practices and keep your website
              fast.
            </p>
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            {FEATURES.map((feature) => (
              <div key={feature.title}>
                <div className="flex items-center justify-center">
                  {feature.illustration}
                </div>
                <h3 className="mt-3 font-semibold text-lg tracking-tight md:mt-6">
                  {feature.title}
                </h3>
                <p className="mt-1.5 text-muted-foreground md:mt-4">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Code examples */}
        <div className="grid gap-8 px-4 py-8 sm:px-12 sm:py-12">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div className="grid max-w-3xl gap-2 text-balance">
              <h2 className="font-semibold text-xl tracking-tight sm:text-2xl md:text-3xl">
                Effortless setup
              </h2>
              <p className="text-lg text-muted-foreground">
                With a simple declarative API to define and use your feature
                flags.
              </p>
            </div>
            <Button variant="outline" className="shrink-0" asChild>
              <Link href="/frameworks/next">
                Read the Docs
                <ArrowRight />
              </Link>
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
        <div className="grid gap-8 px-4 py-8 sm:px-12 sm:py-12">
          <div className="grid max-w-3xl gap-2 text-balance">
            <h2 className="font-semibold text-xl tracking-tight sm:text-2xl md:text-3xl lg:text-[40px]">
              What builders say about the Flags SDK
            </h2>
          </div>
          <Testimonials />
        </div>

        {/* CTA */}
        <section className="flex flex-col gap-4 px-8 py-10 sm:px-12 md:flex-row md:items-center md:justify-between">
          <h2 className="font-semibold text-xl tracking-tight sm:text-2xl md:text-3xl lg:text-[40px]">
            Deploy your first flag today.
          </h2>
          <div className="inline-flex items-center gap-3">
            <Button size="lg" asChild>
              <Link href="/frameworks/next">Get Started</Link>
            </Button>
            <CopySnippet text="npm i flags" />
          </div>
        </section>

      </div>
    </div>
  );
}
