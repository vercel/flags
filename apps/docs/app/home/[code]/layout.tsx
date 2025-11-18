import type { ReactNode } from 'react';
import { enableBannerFlag, rootFlags } from '@/lib/custom/flags';

export default async function Layout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const bannerFlag = await enableBannerFlag(code, rootFlags);
  return (
    <>
      {bannerFlag ? (
        <div className="text-pretty bg-gray-1000 py-3 text-center text-gray-100 text-label-12 md:text-label-14">
          Flags SDK is the simplest way to use feature flags in Next.js and
          SvelteKit.
        </div>
      ) : null}
      {children}
    </>
  );
}
