'use client';

import { ChevronRight, LogoNext, LogoSvelte } from '@vercel/geist/icons';
import type { PageTree } from 'fumadocs-core/server';
import { RootToggle } from 'fumadocs-ui/components/layout/root-toggle';
import { useTreeContext } from 'fumadocs-ui/provider';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useMobileMenuContext } from '@/context/use-mobile-menu-context';
import { useLockBodyScroll } from '@/hooks/use-lock-body-scroll';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { itemVariants } from './sidebar';

export const MobileMenu = () => {
  const { root } = useTreeContext();
  const { openMobileMenu, setOpenMobileMenu } = useMobileMenuContext();
  const isMobile = useIsMobile();
  const pathname = usePathname();

  useEffect(() => {
    if (!isMobile) {
      setOpenMobileMenu(false);
    }
  }, [isMobile, setOpenMobileMenu]);

  useLockBodyScroll(openMobileMenu);

  return (
    <Collapsible
      className="group/collapsible absolute top-0 isolate z-10 block w-full border-b bg-background-200 px-4 text-base md:hidden"
      open={openMobileMenu}
      onOpenChange={setOpenMobileMenu}
    >
      <CollapsibleTrigger className="flex h-[var(--mobile-menu-height)] w-full items-center gap-x-2 text-gray-1000">
        <ChevronRight
          size={14}
          color="gray-1000"
          className="transition-transform group-data-[state=open]/collapsible:rotate-90"
        />
        Menu
      </CollapsibleTrigger>
      <CollapsibleContent className="h-full">
        {pathname.includes('/frameworks/') ? (
          <RootToggle
            className="w-full border bg-background-100"
            options={[
              {
                title: 'Next.js',
                description: 'Flags SDK for Next.js',
                url: '/frameworks/next',
                icon: <LogoNext />,
              },
              {
                title: 'SvelteKit',
                description: 'Flags SDK for SvelteKit',
                url: '/frameworks/sveltekit',
                icon: <LogoSvelte className="grayscale" />,
              },
            ]}
          />
        ) : null}
        <div className="flex h-full flex-col gap-y-2.5 py-3">
          {renderMobileList(root.children, 1)}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

const MobileMenuLink = ({ item }: { item: PageTree.Item }) => {
  const { setOpenMobileMenu } = useMobileMenuContext();
  return (
    <Link
      href={item.url}
      key={item.url}
      onClick={() => setOpenMobileMenu(false)}
      className={cn(
        itemVariants(),
        'text-base font-normal text-gray-900 no-underline first-of-type:mt-1 hover:text-gray-1000 [&:not(:first-of-type)]:mt-0',
      )}
    >
      {item.name}
    </Link>
  );
};

export function renderMobileList(items: PageTree.Node[], level: number) {
  return items.map((item, i) => {
    const id = `${item.type}_${i}`;

    switch (item.type) {
      case 'separator':
        return (
          <span className={cn(itemVariants(), 'text-base')} key={id}>
            {item.name}
          </span>
        );
      case 'folder':
        return (
          <Collapsible key={id} className="group/folder flex flex-col gap-y-1">
            {item.index ? (
              <div className={cn(itemVariants())}>{item.name}</div>
            ) : (
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className={cn(itemVariants(), 'group/trigger text-base')}
                >
                  {item.name}
                  <ChevronRight
                    data-icon
                    className="ml-auto transition-transform group-data-[state=open]/folder:rotate-90"
                    size={12}
                  />
                </button>
              </CollapsibleTrigger>
            )}
            <CollapsibleContent>
              <div className="flex flex-col gap-y-2 pb-1">
                {renderMobileList(item.children, level + 1)}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      default:
        return <MobileMenuLink key={id} item={item} />;
    }
  });
}
