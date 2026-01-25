import { Analytics } from '@vercel/analytics/next';
import { VercelToolbar } from '@vercel/toolbar/next';
import type { Metadata } from 'next';
import { Toaster } from 'sonner';

import './globals.css';
import { flagsClient } from '@vercel/flags-core';
import { ExamplesBanner } from '@/components/banners/examples-banner';

export const metadata: Metadata = {
  title: 'Flags SDK Example',
  description: 'A Flags SDK example for Ecommerce',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await flagsClient.ensureFallback();
  return (
    <html lang="en">
      <body className="antialiased">
        <ExamplesBanner />
        {children}
        <Toaster />
        <Analytics />
        <VercelToolbar />
      </body>
    </html>
  );
}
