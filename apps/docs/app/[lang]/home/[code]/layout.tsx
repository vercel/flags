import { HomeLayout } from '@/components/geistdocs/home-layout';
import { enableBannerFlag, rootFlags } from '@/flags';
import { source } from '@/lib/geistdocs/source';

export default async function Layout({
  children,
  params,
}: LayoutProps<'/[lang]/home/[code]'>) {
  const { lang, code } = await params;
  const bannerFlag = await enableBannerFlag(code, rootFlags);
  return (
    <>
      {bannerFlag ? (
        <div className="text-pretty bg-foreground py-3 text-center text-background text-xs md:text-sm">
          Flags SDK is the simplest way to use feature flags in Next.js and
          SvelteKit.
        </div>
      ) : null}
      <HomeLayout tree={source.pageTree[lang]}>
        <div className="bg-sidebar pt-0 pb-32">{children}</div>
      </HomeLayout>
    </>
  );
}
