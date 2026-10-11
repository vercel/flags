import { expect, test } from '@playwright/test';
import { encryptOverrides } from 'flags';
import { FLAGS_SECRET } from '../playwright.config';

test('serves the manifest of the flags in development', async ({ request }) => {
  const response = await request.get('/.well-known/flags/manifest.json');

  expect(response.headers()['cache-control']).toBe('no-store');
  const manifest = await response.json();
  expect(Object.keys(manifest.definitions)).toEqual([
    'banner-text',
    'greeting',
    'new-checkout',
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

test('uses flags.config.ts and the request without onInvoke', async ({
  request,
}) => {
  const [anonymous, alice] = await Promise.all([
    request.get('/config'),
    request.get('/config', { headers: { cookie: 'user=alice' } }),
  ]);

  expect(await anonymous.text()).toContain(
    '{"checkout":false,"text":"Hello from flags.config.ts"}',
  );
  expect(await alice.text()).toContain('{"checkout":true');
});

test('applies an override cookie', async ({ request }) => {
  const token = await encryptOverrides({ 'new-checkout': true }, FLAGS_SECRET);
  const response = await request.get('/config', {
    headers: { cookie: `flag-overrides=${token}` },
  });

  expect(await response.text()).toContain('{"checkout":true');
});

test('lets a redirect of SvelteKit through', async ({ request }) => {
  const response = await request.get('/config', {
    headers: { cookie: 'blocked=1' },
    maxRedirects: 0,
  });

  expect(response.status()).toBe(307);
  expect(response.headers().location).toBe('/blocked');
});
