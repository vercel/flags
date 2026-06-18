import { createSitemapMarkdownRoute } from '@vercel/geistdocs/routes/sitemap';
import { config } from '@/lib/geistdocs/config';
import { geistdocsSource } from '@/lib/geistdocs/source';

const sitemapMarkdownRoute = createSitemapMarkdownRoute({
  config,
  source: geistdocsSource,
});

export const GET = sitemapMarkdownRoute.GET;
export const generateStaticParams = sitemapMarkdownRoute.generateStaticParams;
export const revalidate = false;
export const dynamic = 'error';
