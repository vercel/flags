import { HomeLayout } from '@/components/geistdocs/home-layout';
import { enableBannerFlag, rootFlags } from '@/flags';
import { source } from '@/lib/geistdocs/source';

export default async function Layout({
  children,
  params,
}: LayoutProps<"/[lang]/home/[code]">) {
  const { lang, code } = await params;
  const bannerFlag = await enableBannerFlag(code, rootFlags);
  return (
    <>
      {bannerFlag ? (
        <div className="text-pretty bg-gray-1000 py-3 text-center text-gray-100 text-label-12 md:text-label-14">
          Flags SDK is the simplest way to use feature flags in Next.js and
          SvelteKit.
        </div>
      ) : null}
      <HomeLayout tree={source.pageTree[lang]}>
        {children}
      </HomeLayout>
    </>
  );
}
