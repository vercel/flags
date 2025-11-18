import { LogoNext, LogoSvelte } from '@vercel/geist/icons';
import type { PageTree } from 'fumadocs-core/server';
import { RootToggle } from 'fumadocs-ui/components/layout/root-toggle';
import { TreeContextProvider } from 'fumadocs-ui/provider';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarInset,
} from '@/components/ui/sidebar';
import { MobileMenuProvider } from '@/context/use-mobile-menu-context';
import { LayoutBody, SidebarItems, TableOfContents } from './docs.client';
import { MobileMenu } from './mobile-menu';
import { SidebarViewport } from './sidebar';

interface DocsLayoutProps {
  tree: PageTree.Root;
  children: React.ReactNode;
}

const DocsLayout = ({ tree, children }: DocsLayoutProps) => {
  if (!tree) return null;
  return (
    <TreeContextProvider tree={tree}>
      <LayoutBody>
        <Sidebar className="sticky left-auto top-[calc(var(--nav-height)+32px)] h-[calc(100svh-var(--nav-height)-64px)] justify-self-end border-none">
          <RootToggle
            className="px-6 [&>svg]:me-0"
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
          <SidebarViewport>
            <SidebarContent>
              <SidebarGroup className="px-6">
                <SidebarItems />
              </SidebarGroup>
            </SidebarContent>
          </SidebarViewport>
        </Sidebar>
        <SidebarInset>
          <div className="flex w-full flex-row gap-x-6 [&_article]:mt-[var(--mobile-menu-height)] md:[&_article]:mt-0 md:[&_article]:px-0 [&_h1]:mb-0 [&_h1]:!tracking-tight [&_h1]:text-heading-40">
            <div className="grid w-full max-w-3xl grid-cols-1 gap-10 px-0 md:pr-4 xl:mx-auto xl:px-0">
              <MobileMenuProvider>
                <MobileMenu />
              </MobileMenuProvider>
              {children}
            </div>
            <aside
              id="nd-toc"
              className="sticky top-[calc(var(--nav-height)+32px)] hidden h-fit shrink-0 flex-col gap-2.5 overflow-x-hidden p-2 md:w-[256px] xl:flex 2xl:w-72"
            >
              <TableOfContents />
            </aside>
          </div>
        </SidebarInset>
      </LayoutBody>
    </TreeContextProvider>
  );
};

export default DocsLayout;
