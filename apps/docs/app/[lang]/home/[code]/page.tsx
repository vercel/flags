import { FlagValues } from '@flags-sdk/next/flag-values';
import {
  generatePermutations,
  getPrecomputed,
} from '@flags-sdk/next/precompute';
import { Button } from '@vercel/geistdocs/components/button';
import {
  CommandPromptContent,
  CommandPromptCopy,
  CommandPromptPrefix,
  CommandPromptRoot,
  CommandPromptSurface,
  CommandPromptViewport,
} from '@vercel/geistdocs/components/command-prompt';
import {
  TabContent,
  TabsWithChildren,
} from '@vercel/geistdocs/components/tabs-with-children';
import type { GeistdocsAgentReadinessConfig } from '@vercel/geistdocs/config';
import {
  Blocks,
  FileCode2,
  Gauge,
  Layers,
  ScanEye,
  ShieldCheck,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { config } from '@/lib/geistdocs/config';
import { buildHomeMetadata } from '@/lib/site/home-metadata';
import { rootFlags } from '@/root-flags';
import {
  enableBannerFlag,
  enableDitheredHeroFlag,
  enableHeroTextFlag,
  installAudienceFlag,
} from '@/site-flags';
import HeroImage from './components/hero-image';
import { Adaptable, Effortless, Flexible } from './components/illustrations';
import Testimonials from './components/testimonials';
import { HighlightedCode } from './highlighted-code';
import { InstallCommand } from './install-command';
import { FlagSelect, FlagToggle } from './toggles';

// -----------------------------------------------------------------------------
// Code samples. They use the public API of `flags` v5, and match the docs.
// -----------------------------------------------------------------------------

// A gradual reveal: the import first, then where the flag comes from, then
// what happens behind the scenes.

const importCode = `import { enableSale } from 'flags:self';

const sale = await enableSale();`;

const providerCode = `import { VercelProvider } from '@vercel/flags-core/openfeature';

export default new VercelProvider();`;

const contextCode = `export default (_input, request) => ({
  user: request?.cookies?.get('user-id')?.value,
});`;

const generatedCode = `const source = defineSource({ provider, getEvaluationContext });

export const enableSale = bindFlag({
  key: 'enableSale',
  source,
  options: [false, true],
});`;

const inlineCode = `import { defineFlag } from 'flags';

export const enableSale = defineFlag({
  key: 'enableSale',
  decide: () => Date.now() > SALE_START,
});`;

const frameworks: { name: string; filename: string; code: string }[] = [
  {
    name: 'Next.js',
    filename: 'app/page.tsx',
    code: `export default async function Page() {
  return (await enableSale()) ? <Sale /> : null;
}`,
  },
  {
    name: 'SvelteKit',
    filename: 'src/routes/+page.server.ts',
    code: `export const load = async () => ({
  sale: await enableSale(),
});`,
  },
  {
    name: 'Nuxt',
    filename: 'server/api/sale.get.ts',
    code: `export default defineEventHandler(async () => ({
  sale: await enableSale(),
}));`,
  },
  {
    name: 'TanStack Start',
    filename: 'src/routes/index.tsx',
    code: `const getSale = createServerFn().handler(() => enableSale());`,
  },
  {
    name: 'Hono',
    filename: 'src/server.ts',
    code: `app.use(flags());
app.get('/', async (c) => c.json({ sale: await enableSale() }));`,
  },
  {
    name: 'Express',
    filename: 'src/server.ts',
    code: `app.use(flags());
app.get('/', async (req, res) => res.json({ sale: await enableSale() }));`,
  },
  {
    name: 'Node.js',
    filename: 'server.ts',
    code: `const sale = await runtime.onInvoke(request, () => enableSale());`,
  },
];

// -----------------------------------------------------------------------------
// Content
// -----------------------------------------------------------------------------

const PILLARS = [
  {
    title: 'Any provider, through OpenFeature',
    description:
      'Bring any OpenFeature server provider: Vercel Flags, LaunchDarkly, flagd, ConfigCat and more. No wrappers, no lock-in.',
    illustration: <Flexible />,
  },
  {
    title: 'Any framework, or none',
    description:
      'The same flags run in Next.js, SvelteKit, Nuxt, TanStack Start, Hono, Express and plain Node.js.',
    illustration: <Effortless />,
  },
  {
    title: 'Release with confidence',
    description:
      'Roll out gradually, run experiments, and keep pages static with precompute. One value per request, every time.',
    illustration: <Adaptable />,
  },
];

const FEATURES: { icon: ReactNode; title: string; description: string }[] = [
  {
    icon: <Layers size={20} />,
    title: 'Inline and provider flags',
    description:
      'Decide a flag in code with defineFlag, or bind it to a provider with bindFlag. Both work the same way.',
  },
  {
    icon: <FileCode2 size={20} />,
    title: 'Code generation, if you want it',
    description:
      'Generate typed flags from your provider and import them from flags:<source>. The output is the code you would write.',
  },
  {
    icon: <ShieldCheck size={20} />,
    title: 'Typed end to end',
    description:
      'TypeScript checks the value of each flag, and the evaluation context which each step of the chain must give.',
  },
  {
    icon: <Gauge size={20} />,
    title: 'Fast and consistent',
    description:
      'Each flag is evaluated once per request, so every part of a page sees the same value. Providers start once.',
  },
  {
    icon: <ScanEye size={20} />,
    title: 'Flags Explorer built in',
    description:
      'Override any flag for your browser from the Vercel Toolbar. Flags are discovered from a manifest, with no endpoint to write.',
  },
  {
    icon: <Blocks size={20} />,
    title: 'Hooks, events and tracking',
    description:
      'OpenFeature hooks for logging and telemetry, provider events, and tracking for experiments, without an OpenFeature client.',
  },
];

const ROLES = [
  {
    title: 'For application developers',
    description:
      'Learn one API for flags. Change frameworks or providers without rewriting your flags.',
    href: '/docs/getting-started/quickstart',
    cta: 'Quickstart',
  },
  {
    title: 'For framework authors',
    description:
      'Implement a small, documented contract, and check your binding with the conformance suite.',
    href: '/docs/standard/framework-bindings',
    cta: 'The binding contract',
  },
  {
    title: 'For provider authors',
    description:
      'Ship one OpenFeature provider. It works with every framework that supports the standard.',
    href: '/docs/providers/custom-providers',
    cta: 'Write a provider',
  },
];

// All flag combinations are known upfront and generated statically.
export async function generateStaticParams() {
  const codes = await generatePermutations(rootFlags);
  return codes.map((code) => ({ code }));
}

export const generateMetadata = async ({
  params,
}: PageProps<'/[lang]/home/[code]'>): Promise<Metadata> => {
  const { lang } = await params;
  const agentConfig = config.agent as GeistdocsAgentReadinessConfig | undefined;

  return buildHomeMetadata({
    lang,
    siteUrl: config.siteUrl,
    agentReadinessEnabled: Boolean(
      agentConfig && agentConfig.enabled !== false,
    ),
  });
};

function SectionHeading({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
      <div className="grid max-w-3xl gap-2 text-balance">
        <h2 className="text-heading-20 sm:text-heading-24 md:text-heading-32 lg:text-heading-40">
          {title}
        </h2>
        <p className="text-lg text-gray-900">{description}</p>
      </div>
      {children}
    </div>
  );
}

function DocsButton({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} prefetch={true} className="shrink-0">
      <Button
        Component="span"
        className="rounded-full"
        size="large"
        variant="secondary"
      >
        {label}
      </Button>
    </Link>
  );
}

function RevealStep({
  step,
  title,
  description,
  children,
}: {
  step: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-20">
      <div className="grid content-start gap-2">
        <span className="font-mono text-copy-14 text-gray-900">{step}</span>
        <h3 className="text-heading-20 sm:text-heading-24">{title}</h3>
        <p className="max-w-md text-gray-900">{description}</p>
      </div>
      {children}
    </div>
  );
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  // The proxy evaluated the flags, and put their values into the code. The
  // page reads them without evaluating again, so it stays static.
  const [bannerFlag, ditheredHeroFlag, heroTextFlag, installAudience] =
    await getPrecomputed(
      [
        enableBannerFlag,
        enableDitheredHeroFlag,
        enableHeroTextFlag,
        installAudienceFlag,
      ],
      rootFlags,
      code,
    );
  const audience = installAudience === 'humans' ? 'humans' : 'agents';

  return (
    <div className="mx-auto w-full max-w-[1448px] px-4 sm:px-6">
      {/* The values for Flags Explorer. Plain, because these flags only
          choose the look of this page. */}
      <FlagValues
        plain
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
          <h1 className="text-balance text-heading-40 sm:text-heading-48 xl:text-heading-64 max-w-xl">
            {heroTextFlag}
          </h1>
          <p className="mt-5 max-w-xl text-balance text-gray-900 leading-relaxed text-copy-18">
            Flags SDK is an open standard for feature flags in JavaScript.
            Define a flag once and evaluate it in any framework, or none, with
            any OpenFeature provider.
          </p>
          <InstallCommand flagKey={installAudienceFlag.key} value={audience} />
        </div>
        <div className="relative col-span-12 lg:col-span-5 p-4">
          {ditheredHeroFlag ? <HeroImage /> : null}

          <div className="relative rounded-xl bg-background-100 p-4 md:p-6 shadow-(--ds-shadow-menu)">
            <div className="flex flex-col gap-y-1 px-2">
              <div className="mb-0.5 text-heading-20">Try the Flags SDK</div>
              <span className="text-gray-900 text-sm">
                These are real flags of this page, precomputed per visitor.
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

      <div className="grid">
        {/* The reveal */}
        <div className="grid gap-10 py-8 sm:py-12">
          <SectionHeading
            title="A flag is an import"
            description="Start with the simplest thing that works. Then look behind the curtain: there is no magic, only a few lines of plain code."
          >
            <DocsButton
              href="/docs/getting-started/quickstart"
              label="Quickstart"
            />
          </SectionHeading>
          <RevealStep
            step="1"
            title="Import a flag, and call it"
            description="Each flag of your provider is a typed import. Call it on the server, in any framework."
          >
            <HighlightedCode
              code={importCode}
              lang="typescript"
              filename="app/page.tsx"
              caption="The whole API, for most of your code"
            />
          </RevealStep>
          <RevealStep
            step="2"
            title="It comes from your provider"
            description="A folder in flags/sources connects a provider. The provider is any OpenFeature provider. The context tells it who the user is."
          >
            <div className="grid gap-6">
              <HighlightedCode
                code={providerCode}
                lang="typescript"
                filename="flags/sources/self/provider.ts"
                caption="Any OpenFeature provider"
              />
              <HighlightedCode
                code={contextCode}
                lang="typescript"
                filename="flags/sources/self/context.ts"
                caption="The evaluation context, once per request"
              />
            </div>
          </RevealStep>
          <RevealStep
            step="3"
            title="Behind the scenes"
            description="Code generation reads the flags of your provider, and writes plain code: one source, and one flag for each key. You can write the same code by hand."
          >
            <HighlightedCode
              code={generatedCode}
              lang="typescript"
              filename=".flags/self.ts"
              caption="What flags:self contains (simplified)"
            />
          </RevealStep>
          <RevealStep
            step="4"
            title="Or decide in code"
            description="Not every flag needs a provider. An inline flag decides its value in your code, and gets the same overrides, caching and types."
          >
            <HighlightedCode
              code={inlineCode}
              lang="typescript"
              filename="flags.ts"
              caption="An inline flag"
            />
          </RevealStep>
        </div>

        {/* Every framework */}
        <div className="grid gap-8 py-8 sm:py-12">
          <SectionHeading
            title="Same flag, every framework"
            description="Each framework gets a small package that connects the request. Your flags never change."
          >
            <DocsButton href="/docs/frameworks" label="All frameworks" />
          </SectionHeading>
          <TabsWithChildren
            ariaLabel="Framework"
            tabs={frameworks.map((framework) => framework.name)}
          >
            {frameworks.map((framework, index) => (
              <TabContent
                className="mt-4"
                key={framework.name}
                order={index + 1}
              >
                <HighlightedCode
                  code={framework.code}
                  lang="tsx"
                  filename={framework.filename}
                  caption={`enableSale in ${framework.name}`}
                />
              </TabContent>
            ))}
          </TabsWithChildren>
        </div>

        {/* Pillars */}
        <div className="grid gap-8 py-8 sm:py-20">
          <SectionHeading
            title="One primitive for the whole ecosystem"
            description="Feature flags are part of how software ships. They deserve one shared foundation, not a new SDK for every framework and every vendor."
          />
          <div className="grid gap-6 md:gap-20 md:grid-cols-3">
            {PILLARS.map((pillar) => (
              <div key={pillar.title}>
                <div className="flex items-center justify-center">
                  {pillar.illustration}
                </div>
                <h3 className="mt-3 text-heading-20 md:mt-6">{pillar.title}</h3>
                <p className="mt-1.5 text-gray-900 md:mt-4">
                  {pillar.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Features */}
        <div className="grid gap-8 py-8 sm:py-12">
          <SectionHeading
            title="Everything a flag needs"
            description="The SDK sits between your application and your providers, and handles the parts every team would otherwise build again."
          />
          <div className="grid gap-x-12 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="grid gap-2">
                <div className="flex items-center gap-2 text-gray-1000">
                  {feature.icon}
                  <h3 className="text-heading-16">{feature.title}</h3>
                </div>
                <p className="text-gray-900">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* The standard */}
        <div className="grid gap-8 py-8 sm:py-12">
          <SectionHeading
            title="An open standard"
            description="The provider contract is OpenFeature. The contract between frameworks and the SDK is a written standard, with a conformance suite that any framework can run."
          >
            <DocsButton href="/docs/standard" label="Read the standard" />
          </SectionHeading>
          <div className="grid gap-6 md:grid-cols-3">
            {ROLES.map((role) => (
              <Link
                key={role.title}
                href={role.href}
                prefetch={true}
                className="group grid gap-2 rounded-xl border bg-background-100 p-6 transition-colors hover:bg-gray-100"
              >
                <h3 className="text-heading-20">{role.title}</h3>
                <p className="text-gray-900">{role.description}</p>
                <span className="mt-2 text-copy-14 font-medium text-gray-1000">
                  {role.cta} →
                </span>
              </Link>
            ))}
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
            Ship your first flag today
          </h2>
          {/* Stack until the section itself goes side-by-side at md, and keep
              the buttons on the heading's left edge while stacked. */}
          <div className="flex flex-col items-start gap-3 md:flex-row md:items-center">
            <Link
              href="/docs/getting-started/quickstart"
              prefetch={true}
              className="shrink-0"
            >
              <Button Component="span" className="rounded-full" size="large">
                Get Started
              </Button>
            </Link>
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
