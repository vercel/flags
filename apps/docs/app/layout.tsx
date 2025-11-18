import { VercelToolbar } from '@vercel/toolbar/next';
import { generatePermutations } from 'flags/next';
import { CommandIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Footer from '@/components/custom/footer';
import { Navbar } from '@/components/geistdocs/navbar';
import { GeistdocsProvider } from '@/components/geistdocs/provider';
import { rootFlags } from '@/lib/custom/flags';
import { mono, sans } from '@/lib/geistdocs/fonts';
import { cn } from '@/lib/utils';
import './global.css';

const Logo = () => <CommandIcon className="size-5" />;

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
