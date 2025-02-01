import localFont from 'next/font/local';
import '../app/globals.css';
import { VercelToolbar } from '@vercel/toolbar/next';
import { ThemeProvider } from './theme-provider';

const geistSans = localFont({
  src: '../app/fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
});

const geistMono = localFont({
  src: '../app/fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
});

export default function PagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const shouldInjectToolbar = process.env.NODE_ENV === 'development';
  return (
    <div
      className={`${geistSans.variable} ${geistMono.variable} antialiased prose lg:prose-lg px-4 m-0`}
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
    </div>
  );
}
