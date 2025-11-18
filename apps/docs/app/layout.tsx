import { VercelToolbar } from '@vercel/toolbar/next';
import { generatePermutations } from 'flags/next';
import type { Metadata } from 'next';
import Footer from '@/components/custom/footer';
import { Navbar } from '@/components/geistdocs/navbar';
import { GeistdocsProvider } from '@/components/geistdocs/provider';
import { rootFlags } from '@/lib/custom/flags';
import { mono, sans } from '@/lib/geistdocs/fonts';
import { cn } from '@/lib/utils';
import './global.css';

const Logo = () => (
  <div className="flex flex-row items-center gap-2">
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>Flags SDK</title>
      <rect width="16" height="16" rx="4" fill="currentColor" />
      <path
        d="M6.5 9.75C5.25 9.75 4.5 10.5 4.5 10.5V6C4.5 6 5.25 5.25001 6.5 5.25C7.75 5.24999 8.25 6.25 9.5 6.25C10.75 6.25 11.5 5.625 11.5 5.625V10.125C11.5 10.125 10.75 10.75 9.5 10.75C8.25 10.75 7.75 9.75 6.5 9.75Z"
        fill="currentColor"
        className="invert"
      />
    </svg>
    <div className="text-lg font-bold">
      Flags <span className="hidden min-[385px]:inline">SDK</span>
    </div>
  </div>
);

const links = [
  {
    label: 'Docs',
    href: '/docs',
  },
];

const suggestions = [
  'What is Vercel?',
  'What can I deploy with Vercel?',
  'What is Fluid Compute?',
  'How much does Vercel cost?',
];

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

const Layout = ({ children }: LayoutProps<'/'>) => (
  <html
    className={cn(sans.variable, mono.variable, 'scroll-smooth antialiased')}
    lang="en"
    suppressHydrationWarning
  >
    <body>
      <GeistdocsProvider>
        <Navbar items={links} suggestions={suggestions}>
          <Logo />
        </Navbar>
        {children}
        <Footer />
      </GeistdocsProvider>
      {process.env.NODE_ENV === 'development' && <VercelToolbar />}
    </body>
  </html>
);

export default Layout;
