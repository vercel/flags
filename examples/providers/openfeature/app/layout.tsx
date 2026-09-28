import { VercelToolbar } from '@vercel/toolbar/next';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Header } from './header';
import './globals.css';

export const metadata: Metadata = {
  title: 'Flags SDK + OpenFeature',
  description: 'A minimal OpenFeature example using the Flags SDK.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Header />
        {children}
        {process.env.NODE_ENV === 'development' && <VercelToolbar />}
      </body>
    </html>
  );
}
