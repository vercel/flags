import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// The platform variant: flags.config.ts has no default connection, and the
// test adapter points flags/default-provider to the provider of the platform

test('uses the default provider of the platform', async ({ request }) => {
  const response = await request.get('/api/flags');

  expect(await response.json()).toMatchObject({
    sale: true,
    checkout: true,
    banner: 'From the platform',
  });
});

test('gives the platform the manifest of the flags', () => {
  const manifest = JSON.parse(
    readFileSync('.next-platform/platform-output/flags-manifest.json', 'utf8'),
  );

  expect(Object.keys(manifest.definitions)).toEqual([
    'banner-text',
    'new-checkout',
    'plain-flag',
    'summer-sale',
  ]);
  // Without a default connection, the flags use Vercel Flags. A tool builds
  // the links from its system manifest.
  expect(manifest.connections['vercel-flags']).toMatchObject({
    system: 'vercel-flags',
    systemManifest: 'https://flags-sdk.dev/system-manifests/vercel-flags.json',
  });
  expect(manifest.definitions['summer-sale'].connection).toBe('vercel-flags');
});
