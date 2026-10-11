import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { encryptOverrides } from 'flags';
import { FLAGS_SECRET } from '../playwright.config';

test('evaluates the flags in a server route', async ({ request }) => {
  const response = await request.get('/api/flags');

  expect(await response.json()).toEqual({
    sale: true,
    banner: 'Summer sale!',
  });
});

test('registers the flags of a use flags module', async ({ request }) => {
  const response = await request.get('/api/registered');

  expect(await response.json()).toMatchObject({
    providers: expect.arrayContaining(['lazy']),
  });
});

test('has no public manifest route in production', async ({ request }) => {
  const response = await request.get('/.well-known/flags/manifest.json');

  // Without a pages directory, Nuxt renders app.vue for each path
  expect(response.headers()['content-type']).toContain('text/html');
});

test('writes the manifest of the flags into the server output', () => {
  const manifest = JSON.parse(
    readFileSync('.output/server/flags-manifest.json', 'utf8'),
  );

  expect(manifest).toEqual({
    version: 1,
    connections: {
      'in-memory': { system: 'in-memory', variables: {} },
    },
    definitions: {
      'banner-text': {
        type: 'string',
        defaultValue: 'Welcome',
        description: 'The text of the banner',
        declaredInCode: true,
        connection: 'in-memory',
        sources: [{ module: 'lib/flags.ts', export: 'bannerText' }],
      },
      greeting: {
        type: 'string',
        defaultValue: 'Hi',
        declaredInCode: true,
        connection: 'in-memory',
        sources: [{ module: 'lib/default-flags.ts', export: 'greeting' }],
      },
      'new-checkout': {
        type: 'boolean',
        declaredInCode: true,
        connection: 'in-memory',
        sources: [{ module: 'lib/default-flags.ts', export: 'newCheckout' }],
      },
      'plain-flag': {
        type: 'boolean',
        declaredInCode: true,
        connection: 'in-memory',
        sources: [{ module: 'lib/lazy-flags.ts', export: 'plainFlag' }],
      },
      'summer-sale': {
        type: 'boolean',
        defaultValue: false,
        declaredInCode: true,
        connection: 'in-memory',
        sources: [{ module: 'lib/flags.ts', export: 'summerSale' }],
      },
    },
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
