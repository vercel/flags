import './global.css';
import '@vercel/geist/styles.css';

import { Analytics } from '@vercel/analytics/next';
import { GeistProvider } from '@vercel/geist/core/provider';
import { VercelToolbar } from '@vercel/toolbar/next';
import clsx from 'clsx';
import { generatePermutations } from 'flags/next';
import { RootProvider } from 'fumadocs-ui/provider';
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import Footer from '@/components/footer';
import { rootFlags } from '@/flags';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export async function generateStaticParams() {
  const codes = await generatePermutations(rootFlags);
  return codes.map((code) => ({ code }));
}

export const metadata: Metadata = {
  title: {
    template: '%s | Flags SDK',
    default: 'Flags SDK',
  },
  description:
    'A free, open-source library for using feature flags in Next.js and SvelteKit.',
  openGraph: {
    siteName: 'Flags SDK',
    type: 'website',
  },
};

export default async function Layout({ children }: { children: ReactNode }) {
  const shouldInjectToolbar = process.env.NODE_ENV === 'development';

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body className={clsx('flex min-h-svh flex-col antialiased')}>
        <RootProvider
          search={{
            enabled: true,
            hotKey: [
              {
                display: '/',
                key: '/',
              },
            ],
          }}
        >
          <GeistProvider storageKey="theme">
            {children}
            {shouldInjectToolbar && <VercelToolbar />}
            <Footer />
          </GeistProvider>
        </RootProvider>
        <Analytics />
      </body>
    </html>
  );
}
