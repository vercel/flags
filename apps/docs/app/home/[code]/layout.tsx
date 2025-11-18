import type { ReactNode } from 'react';
import { enableBannerFlag, rootFlags } from '@/lib/custom/flags';

type HomeLayoutProps = {
  children: ReactNode;
  params: Promise<{ code: string }>;
};

const HomeLayout = async ({ children, params }: HomeLayoutProps) => {
  const { code } = await params;
  const bannerFlag = await enableBannerFlag(code, rootFlags);

  return (
    <div className="bg-sidebar">
      {bannerFlag ? (
        <div className="text-pretty bg-gray-1000 py-3 text-center text-gray-100 text-label-12 md:text-label-14">
          Flags SDK is the simplest way to use feature flags in Next.js and
          SvelteKit.
        </div>
      ) : null}
      {children}
    </div>
  );
};

export default HomeLayout;
