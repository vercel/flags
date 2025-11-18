'use client';

import { Button, ButtonLink, Drawer, Feedback } from '@vercel/geist/components';
import {
  Api,
  BookOpen,
  Box,
  Layers,
  LogoGithub,
  LogoVercel,
  MagnifyingGlass,
  Menu,
  SlashForward,
} from '@vercel/geist/icons';
import { useSearchContext } from 'fumadocs-ui/provider';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ThemeSwitcher } from '../theme-switcher';
import {
  NavigationMenu,
  NavigationMenuIndicator,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from './navigation-menu';

export const PAGES = [
  {
    href: '/principles',
    tooltip: 'Principles',
    name: 'principles',
    icon: <BookOpen />,
  },
  {
    href: '/frameworks/next',
    tooltip: 'Frameworks',
    name: 'frameworks',
    icon: <Box />,
  },
  {
    href: '/providers',
    tooltip: 'Providers',
    name: 'providers',
    icon: <Layers />,
  },
  {
    href: '/api-reference',
    tooltip: 'API Reference',
    name: 'api-reference',
    icon: <Api />,
  },
] as const;

function HomeLinks() {
  return (
    <div className="flex items-center gap-2">
      <Link href="https://vercel.com/" rel="noopener" target="_blank">
        <LogoVercel size={18} className="-translate-y-[0.5px]" />
      </Link>

      <SlashForward color="gray-alpha-400" size={16} />

      <Link className="flex flex-row items-center gap-2" href="/">
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <title>Flags SDK</title>
          <rect width="16" height="16" rx="4" fill="var(--ds-gray-1000)" />{' '}
          <path
            d="M6.5 9.75C5.25 9.75 4.5 10.5 4.5 10.5V6C4.5 6 5.25 5.25001 6.5 5.25C7.75 5.24999 8.25 6.25 9.5 6.25C10.75 6.25 11.5 5.625 11.5 5.625V10.125C11.5 10.125 10.75 10.75 9.5 10.75C8.25 10.75 7.75 9.75 6.5 9.75Z"
            fill="var(--ds-background-100)"
          />{' '}
        </svg>
        <div className="text-lg font-bold">
          Flags <span className="hidden min-[385px]:inline">SDK</span>
        </div>
      </Link>
    </div>
  );
}

export const Navigation = () => {
  const pathname = usePathname();
  const pageFromRoute = pathname ? pathname.split('/')[1] : '';
  const [isNavbarExpanded, setIsNavbarExpanded] = useState(false);

  const { hotKey, setOpenSearch } = useSearchContext();

  return (
    <div className="sticky top-0 z-40 flex h-[var(--nav-height)] justify-between border-b bg-background-200 px-4">
      <div className="flex w-full select-none flex-row items-center">
        <div className="flex flex-shrink-0 flex-row items-center gap-2">
          <HomeLinks />
        </div>
        <div className="hidden w-full justify-end md:flex md:justify-start md:pl-6">
          <NavigationMenu>
            <NavigationMenuList className="h-14 gap-3">
              {PAGES.map((page) => (
                <NavigationMenuItem key={page.href} className="h-full pr-3">
                  <NavigationMenuLink
                    asChild
                    className="flex h-full items-center"
                  >
                    <Link
                      href={page.href}
                      className={cn(
                        'text-sm text-gray-900 transition-colors duration-100 hover:text-gray-1000 data-[active=true]:text-gray-1000',
                      )}
                      data-active={pageFromRoute === page.name}
                    >
                      {page.tooltip}
                    </Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              ))}
              <NavigationMenuIndicator />
            </NavigationMenuList>
          </NavigationMenu>
        </div>
        <span className="ml-auto flex items-center gap-2 md:hidden">
          <Button
            size="small"
            type="secondary"
            aria-label="Toggle search"
            className="items-center justify-center md:!hidden"
            onClick={() => {
              setOpenSearch(true);
            }}
          >
            <MagnifyingGlass />
          </Button>
          <Button
            size="small"
            type="secondary"
            aria-label="Toggle navigation menu"
            svgOnly
            onClick={() => {
              setIsNavbarExpanded(!isNavbarExpanded);
            }}
          >
            <Menu />
          </Button>
        </span>
      </div>

      <Drawer
        onDismiss={(): void => setIsNavbarExpanded(false)}
        show={isNavbarExpanded}
      >
        <div className="p-4">
          {PAGES.map((page) => (
            <ButtonLink
              key={page.href}
              href={page.href}
              className="w-full !justify-start"
              size="large"
              type="tertiary"
              prefix={<div className="text-gray-900">{page.icon}</div>}
              onClickCapture={() => setIsNavbarExpanded(false)}
            >
              {page.tooltip}
            </ButtonLink>
          ))}
        </div>
        <hr className="h-px w-full bg-gray-100" />
        <div className="flex items-center justify-between gap-2 p-4 px-8">
          <span className="text-md font-medium">Theme</span>
          <ThemeSwitcher />
        </div>
      </Drawer>

      <div className="flex items-center gap-2">
        <Button
          size="small"
          type="secondary"
          aria-label="Search…"
          className="group !hidden !font-normal !text-gray-800 hover:!text-gray-1000 md:!flex"
          suffix={
            <span className="flex w-full items-center justify-center rounded border border-gray-200 font-sans text-sm group-hover:border-gray-alpha-400">
              <kbd className="flex h-5 min-h-5 w-fit items-center px-1 py-0 text-center font-sans text-xs">
                {hotKey.map((k, i) => (
                  <span key={`${i}-${k.key}`}>{k.display}</span>
                ))}
              </kbd>
            </span>
          }
          onClick={() => {
            setOpenSearch(true);
          }}
        >
          <div className="text-start lg:w-20 xl:w-24">Search…</div>
        </Button>

        <div className="hidden lg:flex">
          <Feedback siteType="flags-sdk-site" label="flags-sdk" />
        </div>
        <ButtonLink
          size="small"
          prefix={<LogoGithub />}
          className="!hidden lg:!flex"
          href="https://github.com/vercel/flags"
          target="_noblank"
        >
          GitHub
        </ButtonLink>
      </div>
    </div>
  );
};
