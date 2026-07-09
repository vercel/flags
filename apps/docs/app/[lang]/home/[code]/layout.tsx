import { HomeLayout } from '@/components/geistdocs/home-layout';
import { enableBannerFlag, rootFlags } from '@/flags';
import { source } from '@/lib/geistdocs/source';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default async function Layout({
  children,
  params,
}: LayoutProps<'/[lang]/home/[code]'>) {
  const { lang, code } = await params;
  const bannerFlag = await enableBannerFlag(code, rootFlags);
  return (
    <>
      {bannerFlag ? (
        <Link
          href="/providers/vercel"
          className="group flex items-center justify-center gap-x-2 gap-y-1 bg-gray-1000 px-4 py-3 text-center text-background-100 text-xs md:text-sm"
        >
          <span className="inline-flex shrink-0 items-center rounded-full bg-background-100/15 px-2 py-0.5 font-medium text-[10px] uppercase tracking-wide md:text-[11px]">
            New
          </span>
          <span className="text-pretty">
            Vercel Flags is now available — connect your flags with the{' '}
            <code className="font-mono">@flags-sdk/vercel</code> adapter.
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
