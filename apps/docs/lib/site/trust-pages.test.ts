import { describe, expect, it } from 'vitest';
import { buildTrustPageMetadata } from './trust-page-metadata';
import {
  ABOUT_PAGE,
  CONTACT_PAGE,
  getTrustPageTextLength,
  TRUST_PAGES,
  type TrustPage,
} from './trust-pages';

const pages: TrustPage[] = [...TRUST_PAGES];

describe('trust pages', () => {
  it('cover /about and /contact', () => {
    expect(pages.map((page) => page.path)).toEqual(['/about', '/contact']);
  });

  it.each(
    pages,
  )('$path has at least 500 characters of content', (page: TrustPage) => {
    expect(getTrustPageTextLength(page)).toBeGreaterThanOrEqual(500);
  });

  it.each(
    pages,
  )('$path has no Markdown syntax in plain text', (page: TrustPage) => {
    const text = page.sections
      .flatMap((section) => [section.heading, ...section.paragraphs])
      .join('\n');
    expect(text).not.toMatch(/`|\*\*|\]\(|^#/m);
  });

  it.each(
    pages,
  )('$path uses valid absolute or root-relative links', (page: TrustPage) => {
    for (const link of page.sections.flatMap(
      (section) => section.links ?? [],
    )) {
      expect(link.href).toMatch(/^(https:\/\/|\/)/);
      expect(link.label).toBeTruthy();
      expect(link.description).toBeTruthy();
    }
  });

  it('contact page names a security disclosure channel and a postal address', () => {
    const text = CONTACT_PAGE.sections
      .flatMap((section) => section.paragraphs)
      .join('\n');
    expect(text).toContain('responsible.disclosure@vercel.com');
    expect(text).toContain('440 N Barranca Ave #4133');
  });

  it('about page names the maintainer and the license', () => {
    const text = ABOUT_PAGE.sections
      .flatMap((section) => section.paragraphs)
      .join('\n');
    expect(text).toContain('Vercel Inc.');
    expect(text).toContain('MIT');
  });
});

describe('buildTrustPageMetadata', () => {
  it('sets title, description, canonical, and og:type', () => {
    const metadata = buildTrustPageMetadata({
      lang: 'en',
      page: CONTACT_PAGE,
      siteUrl: 'https://flags-sdk.dev',
    });

    expect(metadata.title).toBe('Contact | Flags SDK');
    expect(metadata.description).toBe(CONTACT_PAGE.description);
    expect(metadata.alternates?.canonical).toBe('/contact');
    expect(metadata.openGraph).toMatchObject({
      type: 'website',
      url: '/contact',
    });
  });

  it('omits the canonical URL when the site URL is unknown', () => {
    const metadata = buildTrustPageMetadata({ lang: 'en', page: ABOUT_PAGE });
    expect(metadata.alternates).toBeUndefined();
  });
});
