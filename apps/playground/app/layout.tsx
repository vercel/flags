import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Flags / Playground',
  description:
    'A server-side flags protocol demo with Next.js and Vercel Flags.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
