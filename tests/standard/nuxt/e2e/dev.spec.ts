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
  const response = await request.get('/api/flags');

  expect(await response.json()).toEqual({
    sale: true,
    banner: 'Summer sale!',
  });
});

test('uses flags.config.ts and the request without onInvoke', async ({
  request,
}) => {
  const [anonymous, alice] = await Promise.all([
    request.get('/api/config'),
    request.get('/api/config', { headers: { cookie: 'user=alice' } }),
  ]);

  expect(await anonymous.json()).toEqual({
    checkout: false,
    text: 'Hello from flags.config.ts',
  });
  expect(await alice.json()).toMatchObject({ checkout: true });
});

test('applies an override cookie', async ({ request }) => {
  const token = await encryptOverrides({ 'new-checkout': true }, FLAGS_SECRET);
  const response = await request.get('/api/config', {
    headers: { cookie: `flag-overrides=${token}` },
  });

  expect(await response.json()).toMatchObject({ checkout: true });
});

test('lets an error of Nitro through', async ({ request }) => {
  const response = await request.get('/api/config', {
    headers: { cookie: 'blocked=1' },
  });

  expect(response.status()).toBe(403);
});
