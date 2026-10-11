import { expect, test } from '@playwright/test';

test('serves the manifest of the flags in development', async ({ request }) => {
  const response = await request.get('/.well-known/flags/manifest.json');

  expect(response.headers()['cache-control']).toBe('no-store');
  const manifest = await response.json();
  expect(Object.keys(manifest.definitions)).toEqual([
    'banner-text',
    'plain-flag',
    'summer-sale',
  ]);
});

test('evaluates the flags in development', async ({ request }) => {
  const html = await (await request.get('/')).text();

  expect(html).toContain(
    '<pre id="flags">{"sale":true,"banner":"Summer sale!"}</pre>',
  );
});
