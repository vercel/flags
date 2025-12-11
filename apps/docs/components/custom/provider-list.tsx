import Link from 'next/link';
import { FlagsmithLogo } from './logos/flagsmith';
import { GrowthbookLogo } from './logos/growthbook';
// import { SplitLogo } from './logos/split';
import { HypertuneLogo } from './logos/hypertune';
import { LaunchDarklyLogo } from './logos/launchdarkly';
import { OpenFeatureLogo } from './logos/openfeature';
import { OptimizelyLogo } from './logos/optimizely';
import { PostHogLogo } from './logos/posthog';
import { ReflagLogo } from './logos/reflag';
import { StatsigLogo } from './logos/statsig';
import { Badge } from '@/components/ui/badge';

type Provider = {
  key: string;
  name: string;
  href: string;
  logo: React.ComponentType<{ className?: string }>;
  badges: string[];
  glowColor?: string;
};

const providers = [
  {
    key: 'statsig',
    name: 'Statsig',
    href: '/providers/statsig',
    logo: StatsigLogo,
    badges: ['Adapter', 'Edge Config', 'Flags Explorer', 'Marketplace'],
    glowColor: '#1b63d2',
  },
  {
    key: 'hypertune',
    name: 'Hypertune',
    href: '/providers/hypertune',
    logo: HypertuneLogo,
    badges: ['Adapter', 'Edge Config', 'Flags Explorer', 'Marketplace'],
    glowColor: '#000000',
  },
  {
    key: 'launchdarkly',
    name: 'LaunchDarkly',
    href: '/providers/launchdarkly',
    logo: LaunchDarklyLogo,
    badges: ['Adapter', 'Edge Config', 'Flags Explorer'],
    glowColor: '#7084ff',
  },
  {
    key: 'growthbook',
    name: 'GrowthBook',
    href: '/providers/growthbook',
    logo: GrowthbookLogo,
    badges: ['Adapter', 'Edge Config', 'Flags Explorer', 'Marketplace'],
    glowColor: '#7B51FB',
  },
  {
    key: 'posthog',
    name: 'PostHog',
    href: '/providers/posthog',
    logo: PostHogLogo,
    badges: ['Adapter', 'Flags Explorer'],
    glowColor: '#f54e07',
  },
  {
    key: 'reflag',
    name: 'Reflag',
    href: '/providers/reflag',
    logo: ReflagLogo,
    badges: ['Adapter', 'Flags Explorer'],
    glowColor: '#000000',
  },
  {
    key: 'flagsmith',
    name: 'Flagsmith',
    href: '/providers/flagsmith',
    logo: FlagsmithLogo,
    badges: ['Adapter', 'Flags Explorer'],
    glowColor: '#5d5dff',
  },
  {
    key: 'openfeature',
    name: 'OpenFeature',
    href: '/providers/openfeature',
    logo: OpenFeatureLogo,
    badges: ['Adapter'],
    glowColor: '#5d5dff',
  },
  // Providers with adapter status=coming-soon:
  {
    key: 'optimizely',
    name: 'Optimizely',
    href: '/providers/optimizely',
    logo: OptimizelyLogo,
    badges: ['Flags Explorer'],
    glowColor: '#2fb367',
  },
  // Commented out for even-numbered list
  // {
  //   key: 'split',
  //   name: 'Split',
  //   href: '/providers/split',
  //   logo: SplitLogo,
  //   badges: ['Edge Config', 'Flags Explorer'],
  //   glowColor: '#ff00d2',
  // },
] as const satisfies Provider[];

type ProvidersList = (typeof providers)[number]['key'];
const featuredProviders: ProvidersList[] = [
  'statsig',
  'hypertune',
  'growthbook',
];

export function ProviderList({ featured }: { featured?: boolean }) {
  return (
    <ul className="grid w-full list-none grid-cols-1 gap-3 p-0 md:grid-cols-[repeat(auto-fit,_minmax(300px,1fr))]">
      {providers
        .filter((provider) =>
          featured
            ? featuredProviders.includes(provider.key)
            : !featuredProviders.includes(provider.key),
        )
        .map((provider) => (
          <li
            className="m-0"
            key={provider.key}
            data-replacement={provider.name}
          >
            <Link href={provider.href} className="no-underline">
              <div className="dark:bg-neutral-950 not-prose hover:shadow-neutral-800/5 relative rounded-lg border border-gray-200 p-4 shadow-sm transition-all hover:border-gray-300 hover:shadow-lg">
                <span className="text-neutral-800 dark:text-neutral-100 text-lg font-semibold leading-tight tracking-tight">
                  {provider.name}
                </span>
                <div className="z-10 flex items-center justify-center overflow-hidden">
                  <div className="flex min-h-36 items-center justify-center">
                    <div className="text-black dark:text-white">
                      <provider.logo className="h-8 dark:invert" />
                    </div>
                  </div>
                  {provider.glowColor && (
                    <svg
                      className="pointer-events-none absolute left-0 top-0 size-full"
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                    >
                      <defs>
                        <radialGradient id={`${provider.key}-glow`}>
                          <stop
                            offset="0%"
                            stopColor={`${provider.glowColor}19`}
                          />
                          <stop
                            offset="100%"
                            stopColor={`${provider.glowColor}00`}
                          />
                        </radialGradient>
                      </defs>
                      <ellipse
                        cx="50%"
                        cy="0%"
                        rx="54%"
                        ry="20%"
                        fill={`url(#${provider.key}-glow)`}
                      />
                    </svg>
                  )}
                </div>
                <div className="mt-2 flex h-12 flex-col justify-end">
                  <div className="flex w-full flex-row flex-wrap gap-2 text-gray-900">
                    {provider.badges.map((badge) => (
                      <Badge key={badge} variant="secondary">
                        <span className="sr-only">{'Has badge: '}</span>
                        {badge}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </Link>
          </li>
        ))}
    </ul>
  );
}
