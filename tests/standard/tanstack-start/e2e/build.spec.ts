import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { encryptOverrides } from 'flags';
import { FLAGS_SECRET } from '../playwright.config';

test('evaluates the flags in a server route', async ({ request }) => {
  const [anonymous, alice] = await Promise.all([
    request.get('/api/flags'),
    request.get('/api/flags', { headers: { cookie: 'user=alice' } }),
  ]);

  expect(await anonymous.json()).toEqual({
    checkout: false,
    banner: 'Summer sale!',
  });
  expect(await alice.json()).toMatchObject({ checkout: true });
});

test('evaluates the flags in a server function of a loader', async ({
  request,
}) => {
  const html = await (
    await request.get('/', { headers: { cookie: 'user=alice' } })
  ).text();

  expect(html).toContain('{&quot;checkout&quot;:true');
});

test('applies an override cookie', async ({ request }) => {
  const token = await encryptOverrides({ 'new-checkout': true }, FLAGS_SECRET);
  const response = await request.get('/api/flags', {
    headers: { cookie: `flag-overrides=${token}` },
  });

  expect(await response.json()).toMatchObject({ checkout: true });
});

test('writes the manifest of the flags into the build', () => {
  const manifest = JSON.parse(
    readFileSync('.output/server/flags-manifest.json', 'utf8'),
  );

  expect(Object.keys(manifest.definitions)).toEqual([
    'banner-text',
    'dark-mode',
    'greeting',
    'new-checkout',
  ]);
});

test('uses flags.config.ts and the request without a middleware', async ({
  request,
}) => {
  const [anonymous, alice] = await Promise.all([
    request.get('/api/config'),
    request.get('/api/config', { headers: { cookie: 'user=alice' } }),
  ]);

  expect(await anonymous.json()).toEqual({
    dark: false,
    text: 'Hello from flags.config.ts',
  });
  expect(await alice.json()).toMatchObject({ dark: true });
});

test('uses the binding in a server function of a loader', async ({
  request,
}) => {
  const html = await (
    await request.get('/config', { headers: { cookie: 'user=alice' } })
  ).text();

  expect(html).toContain('{&quot;dark&quot;:true');
});

test('lets a redirect of TanStack Start through', async ({ request }) => {
  const response = await request.get('/config', {
    headers: { cookie: 'blocked=1' },
    maxRedirects: 0,
  });

  expect(response.status()).toBe(307);
  expect(response.headers().location).toContain('/blocked');
});
