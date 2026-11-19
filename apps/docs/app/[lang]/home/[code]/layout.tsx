import { getPrecomputed } from '@flags-sdk/next/precompute';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { HomeLayout } from '@/components/geistdocs/home-layout';
import { getRootLang } from '@/lib/geistdocs/root-params';
import { source } from '@/lib/geistdocs/source';
import { rootFlags } from '@/root-flags';
import { enableBannerFlag } from '@/site-flags';

export default async function Layout({
  children,
  params,
}: LayoutProps<'/[lang]/home/[code]'>) {
  const [{ code }, lang] = await Promise.all([params, getRootLang()]);
  const bannerFlag = await getPrecomputed(enableBannerFlag, rootFlags, code);
  return (
    <>
      {bannerFlag ? (
        <Link
          href="/docs/getting-started"
          prefetch={true}
          className="group flex items-center justify-center gap-x-2 gap-y-1 bg-gray-1000 px-4 py-3 text-center text-background-100 text-xs md:text-sm"
        >
          <span className="inline-flex shrink-0 items-center rounded-full bg-background-100/15 px-2 py-0.5 font-medium text-[10px] uppercase tracking-wide md:text-[11px]">
            New
          </span>
          <span className="text-pretty">
            Flags SDK 5: one standard for feature flags, in every framework and
            on OpenFeature.
          </span>
          <ArrowRight className="hidden size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5 sm:inline-block" />
        </Link>
      ) : null}
      <HomeLayout tree={source.pageTree[lang]}>
        <div className="bg-background-200 pt-0 pb-32">{children}</div>
      </HomeLayout>
    </>
  );
}
