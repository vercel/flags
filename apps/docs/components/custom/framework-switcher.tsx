'use client';

import { LogoNextjs } from '@vercel/geistdocs/assets/logos/logo-nextjs';
import { LogoSvelteKit } from '@vercel/geistdocs/assets/logos/logo-svelte-kit';
import {
  GeistdocsRouteSelect,
  type GeistdocsRouteSelectItem,
} from '@vercel/geistdocs/versions';
import { usePathname } from 'next/navigation';

const frameworks = [
  {
    id: 'next',
    label: 'Next.js',
    href: '/docs/frameworks/next',
    icon: <LogoNextjs className="size-4 text-gray-1000" height={16} />,
    description: 'Flags SDK for Next.js',
  },
  {
    id: 'sveltekit',
    label: 'SvelteKit',
    href: '/docs/frameworks/sveltekit',
    icon: (
      <LogoSvelteKit className="size-4 grayscale text-gray-1000" height={16} />
    ),
    description: 'Flags SDK for SvelteKit',
  },
] satisfies GeistdocsRouteSelectItem[];

export const FrameworkSwitcher = () => {
  const pathname = usePathname();

  if (!pathname.startsWith('/docs/frameworks/')) {
    return null;
  }

  const current = frameworks.find((framework) =>
    pathname.startsWith(framework.href ?? ''),
  )?.id;

  if (!current) {
    return null;
  }

  return (
    <GeistdocsRouteSelect
      ariaLabel="Select framework"
      className="mb-4"
      current={current}
      items={frameworks}
      renderIcon={({ item }) => (
        <span className="flex size-5 shrink-0 items-center justify-center text-gray-1000 [&_svg]:size-4">
          {item.icon}
        </span>
      )}
    />
  );
};
