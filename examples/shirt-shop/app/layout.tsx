import { VercelToolbar } from '@vercel/toolbar/next';
import { Analytics } from '@vercel/analytics/next';
import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'Shirt Shop',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="">
        {children}
        <Analytics />
        <VercelToolbar />
      </body>
    </html>
  );
}
