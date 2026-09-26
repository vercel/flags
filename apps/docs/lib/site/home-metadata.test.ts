import { describe, expect, it } from 'vitest';
import { buildHomeMetadata, HOME_OG_IMAGE_PATH } from './home-metadata';

describe('buildHomeMetadata', () => {
  const metadata = buildHomeMetadata({
    lang: 'en',
    siteUrl: 'https://flags-sdk.dev',
    agentReadinessEnabled: true,
  });

  it('sets a title and description', () => {
    expect(metadata.title).toContain('Flags SDK');
    expect(metadata.description).toBeTruthy();
  });

  it('sets og:type, og:image, and twitter card', () => {
    expect(metadata.openGraph).toMatchObject({
      type: 'website',
      url: '/',
      siteName: 'Flags SDK',
    });
    expect(metadata.openGraph?.images).toEqual([
      expect.objectContaining({ url: HOME_OG_IMAGE_PATH }),
    ]);
    expect(metadata.twitter).toMatchObject({
      card: 'summary_large_image',
      images: [HOME_OG_IMAGE_PATH],
    });
  });

  it('keeps the canonical and text/markdown alternates', () => {
    expect(metadata.alternates).toEqual({
      canonical: '/',
      types: { 'text/markdown': '/agents.md' },
    });
  });

  it('drops the markdown alternate when agent readiness is disabled', () => {
    const disabled = buildHomeMetadata({
      lang: 'en',
      siteUrl: 'https://flags-sdk.dev',
      agentReadinessEnabled: false,
    });
    expect(disabled.alternates).toEqual({ canonical: '/' });
  });

  it('omits alternates without a site URL', () => {
    const local = buildHomeMetadata({
      lang: 'en',
      agentReadinessEnabled: true,
    });
    expect(local.alternates).toBeUndefined();
    expect(local.openGraph).toMatchObject({ type: 'website' });
  });
});
