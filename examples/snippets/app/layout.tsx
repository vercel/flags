import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { VercelToolbar } from '@vercel/toolbar/next';
import { ThemeProvider } from '@/components/theme-provider';

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
});
const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
});

export const metadata: Metadata = {
  title: 'Flags SDK by Vercel',
  description: 'The feature flags SDK by Vercel for Next.js and SvelteKit',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const shouldInjectToolbar = process.env.NODE_ENV === 'development';
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased prose lg:prose-lg dark:prose-invert px-4 m-0`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
        {shouldInjectToolbar && <VercelToolbar />}
      </body>
    </html>
  );
}
