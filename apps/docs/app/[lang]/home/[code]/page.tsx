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
    <div className="mx-auto max-w-6xl px-6 py-12">
      <FlagValues
        values={{
          [enableBannerFlag.key]: bannerFlag,
          [enableDitheredHeroFlag.key]: ditheredHeroFlag,
          [enableHeroTextFlag.key]: heroTextFlag,
        }}
      />

      {/* Hero */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="flex flex-col justify-center">
          <h1 className="mb-2.5 text-4xl font-bold tracking-tight md:text-5xl">
            {heroTextFlag}
          </h1>
          <p className="mb-6 text-lg font-medium text-muted-foreground md:mb-12">
            Flags SDK is a free, open-source library for using feature flags
            in Next.js and SvelteKit.
          </p>
          <div className="flex h-fit gap-x-4">
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
                backgroundColor: 'hsl(var(--background))',
                backgroundImage: `linear-gradient(to top, hsl(var(--muted)) 0%, rgba(255,255,255,0) 100%),
                linear-gradient(to right, hsl(var(--border)) 0.5px, transparent 1px),
                linear-gradient(to bottom, hsl(var(--border)) 0.5px, transparent 1px)`,
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
              <div className="mb-0.5 text-lg font-semibold">Try the Flags SDK</div>
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
      </div>

      {/* Features */}
      <div className="mt-16">
        <h2 className="mb-1 text-2xl font-bold tracking-tight">Using flags as code</h2>
        <p className="max-w-prose text-balance text-muted-foreground">
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
              <h3 className="mt-3 text-xl font-semibold md:mt-6">
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
      <div className="mt-16 rounded-lg border bg-muted/50 p-6 md:p-8">
        <div className="flex flex-col items-start justify-between gap-y-4 md:flex-row">
          <div className="flex flex-col gap-y-1">
            <h2 className="text-2xl font-bold tracking-tight">Effortless setup</h2>
            <p className="text-muted-foreground">
              With a simple declarative API to define and use your feature
              flags.
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/frameworks/next">
              Read the Docs
              <ArrowRight />
            </Link>
          </Button>
        </div>
        <div className="mt-4 grid w-full grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <div className="overflow-hidden rounded-lg border bg-background">
              <div className="border-b bg-muted/50 px-4 py-2 font-mono text-xs text-muted-foreground">
                flags.ts
              </div>
              <pre className="overflow-x-auto p-4 text-sm">
                <code>{flagsSetupCodeblock}</code>
              </pre>
            </div>
            <span className="mt-1 block text-xs text-muted-foreground">Declaring a flag</span>
          </div>
          <div>
            <div className="overflow-hidden rounded-lg border bg-background">
              <div className="border-b bg-muted/50 px-4 py-2 font-mono text-xs text-muted-foreground">
                app/page.tsx
              </div>
              <pre className="overflow-x-auto p-4 text-sm">
                <code>{flagsImportCodeblock}</code>
              </pre>
            </div>
            <span className="mt-1 block text-xs text-muted-foreground">Using a flag</span>
          </div>
        </div>
      </div>

      {/* Testimonials */}
      <div className="mt-16">
        <h2 className="mb-1 text-2xl font-bold tracking-tight">
          What builders say about the Flags SDK
        </h2>
        <Testimonials />
      </div>

      {/* CTA */}
      <div className="mt-16">
        <div className="flex flex-col items-start gap-y-6 md:flex-row md:items-center md:justify-between md:gap-x-6">
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
            Deploy your first flag today.
          </h2>
          <div className="flex gap-x-4">
            <Button size="lg" asChild>
              <Link href="/frameworks/next">Get Started</Link>
            </Button>
            <CopySnippet text="npm i flags" />
          </div>
        </div>
      </div>
    </div>
  );
}
