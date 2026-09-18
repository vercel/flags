import { i18n } from '@/lib/geistdocs/i18n';
import { absoluteUrl } from '@/lib/geistdocs/site-url';
import { buildOpenApiDocument } from '@/lib/site/openapi';

export const generateStaticParams = () =>
  i18n.languages.map((lang) => ({ lang }));

export const GET = () =>
  Response.json(
    buildOpenApiDocument({ origin: absoluteUrl('/').replace(/\/$/, '') }),
    {
      headers: {
        'Cache-Control': 'public, max-age=3600',
        'Content-Type': 'application/json; charset=utf-8',
      },
    },
  );
