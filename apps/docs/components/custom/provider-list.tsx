import Link from 'next/link';
import { cn } from '@/lib/utils';
import { FlagsmithLogo } from './logos/flagsmith';
import { GrowthbookLogo } from './logos/growthbook';
import { HypertuneLogo } from './logos/hypertune';
import { LaunchDarklyLogo } from './logos/launchdarkly';
import { OpenFeatureLogo } from './logos/openfeature';
import { OptimizelyLogo } from './logos/optimizely';
import { PostHogLogo } from './logos/posthog';
import { ReflagLogo } from './logos/reflag';
import { StatsigLogo } from './logos/statsig';
import { Badge } from '../ui/badge';

type Provider = {
  key: string;
  name: string;
  href: string;
  logo: React.ComponentType<{ className?: string }>;
  badges: string[];
  glowColor?: string;
  skipInvert?: boolean;
};

const VercelLogo = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 2048 407"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={cn('fill-current', className)}
  >
    <title>Vercel Logo</title>
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M467.444 406.664L233.722 0.190918L0 406.664H467.444ZM703.186 388.161L898.51 18.668H814.024L679.286 287.007L544.547 18.668H460.061L655.385 388.161H703.186ZM2034.31 18.668V388.162H1964.37V18.668H2034.31ZM1644.98 250.25C1644.98 221.454 1650.99 196.127 1663.01 174.27C1675.03 152.412 1691.79 135.586 1713.28 123.79C1734.77 111.994 1759.91 106.095 1788.69 106.095C1814.19 106.095 1837.14 111.647 1857.54 122.749C1877.94 133.851 1894.15 150.331 1906.17 172.188C1918.19 194.046 1924.39 220.76 1924.75 252.332V268.465H1718.75C1720.2 291.363 1726.94 309.404 1738.96 322.588C1751.35 335.425 1767.93 341.843 1788.69 341.843C1801.8 341.843 1813.83 338.374 1824.75 331.435C1835.68 324.496 1843.88 315.129 1849.34 303.333L1920.93 308.537C1912.18 334.557 1895.79 355.374 1871.75 370.986C1847.7 386.599 1820.02 394.405 1788.69 394.405C1759.91 394.405 1734.77 388.507 1713.28 376.711C1691.79 364.915 1675.03 348.088 1663.01 326.231C1650.99 304.373 1644.98 279.047 1644.98 250.25ZM1852.62 224.23C1850.07 201.678 1842.97 185.199 1831.31 174.79C1819.65 164.035 1805.45 158.657 1788.69 158.657C1769.38 158.657 1753.72 164.382 1741.7 175.831C1729.67 187.28 1722.21 203.413 1719.29 224.23H1852.62ZM1526.96 174.79C1538.62 184.158 1545.9 197.168 1548.82 213.821L1620.94 210.178C1618.39 189.015 1610.93 170.627 1598.54 155.014C1586.15 139.402 1570.13 127.433 1550.45 119.106C1531.15 110.432 1509.84 106.095 1486.52 106.095C1457.74 106.095 1432.61 111.994 1411.11 123.79C1389.62 135.586 1372.86 152.412 1360.84 174.27C1348.82 196.127 1342.81 221.454 1342.81 250.25C1342.81 279.047 1348.82 304.373 1360.84 326.231C1372.86 348.088 1389.62 364.915 1411.11 376.711C1432.61 388.507 1457.74 394.405 1486.52 394.405C1510.56 394.405 1532.42 390.068 1552.09 381.395C1571.77 372.374 1587.79 359.711 1600.18 343.404C1612.57 327.098 1620.03 308.016 1622.58 286.159L1549.91 283.036C1547.36 301.424 1540.25 315.649 1528.6 325.71C1516.94 335.425 1502.91 340.282 1486.52 340.282C1463.94 340.282 1446.45 332.476 1434.06 316.863C1421.68 301.251 1415.49 279.047 1415.49 250.25C1415.49 221.454 1421.68 199.25 1434.06 183.637C1446.45 168.025 1463.94 160.219 1486.52 160.219C1502.19 160.219 1515.66 165.076 1526.96 174.79ZM1172.15 112.328H1237.24L1239.12 165.414C1243.74 150.388 1250.16 138.719 1258.39 130.407C1270.32 118.355 1286.96 112.328 1308.29 112.328H1334.87V169.148H1307.75C1292.56 169.148 1280.09 171.214 1270.32 175.346C1260.92 179.478 1253.69 186.021 1248.63 194.975C1243.93 203.928 1241.58 215.292 1241.58 229.066V388.161H1172.15V112.328ZM871.925 174.27C859.904 196.127 853.893 221.454 853.893 250.25C853.893 279.047 859.904 304.373 871.925 326.231C883.947 348.088 900.704 364.915 922.198 376.711C943.691 388.507 968.827 394.405 997.606 394.405C1028.93 394.405 1056.62 386.599 1080.66 370.986C1104.71 355.374 1121.1 334.557 1129.84 308.537L1058.26 303.333C1052.8 315.129 1044.6 324.496 1033.67 331.435C1022.74 338.374 1010.72 341.843 997.606 341.843C976.841 341.843 960.266 335.425 947.88 322.588C935.858 309.404 929.119 291.363 927.662 268.465H1133.67V252.332C1133.3 220.76 1127.11 194.046 1115.09 172.188C1103.07 150.331 1086.86 133.851 1066.46 122.749C1046.06 111.647 1023.11 106.095 997.606 106.095C968.827 106.095 943.691 111.994 922.198 123.79C900.704 135.586 883.947 152.412 871.925 174.27ZM1040.23 174.79C1051.88 185.199 1058.99 201.678 1061.54 224.23H928.208C931.123 203.413 938.591 187.28 950.612 175.831C962.634 164.382 978.298 158.657 997.606 158.657C1014.36 158.657 1028.57 164.035 1040.23 174.79Z"
      fill="currentColor"
    />
  </svg>
);

const providers: Provider[] = [
  {
    key: 'vercel',
    name: 'Vercel',
    href: '/providers/vercel',
    logo: VercelLogo,
    badges: ['Adapter', 'Edge Config', 'Flags Explorer'],
    glowColor: '#000000',
    skipInvert: true,
  },
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
];

type ProvidersList = (typeof providers)[number]['key'];
const featuredProviders: ProvidersList[] = [
  'vercel',
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
                      <provider.logo
                        className={cn(
                          'h-8',
                          provider.skipInvert ? null : 'dark:invert',
                        )}
                      />
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
