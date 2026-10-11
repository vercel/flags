import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { encryptOverrides } from 'flags';
import { FLAGS_SECRET } from '../playwright.config';

test('evaluates the flags in a handler', async ({ request }) => {
  const response = await request.get('/');

  expect(await response.json()).toEqual({
    sale: true,
    banner: 'Summer sale!',
  });
});

test('the script writes the manifest of the flags', () => {
  const manifest = JSON.parse(readFileSync('flags-manifest.json', 'utf8'));

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
        sources: [{ module: 'src/flags.ts', export: 'bannerText' }],
      },
      'new-checkout': {
        type: 'boolean',
        declaredInCode: true,
        connection: 'in-memory',
        sources: [{ module: 'src/default-flags.ts', export: 'newCheckout' }],
      },
      'summer-sale': {
        type: 'boolean',
        defaultValue: false,
        declaredInCode: true,
        connection: 'in-memory',
        sources: [{ module: 'src/flags.ts', export: 'summerSale' }],
      },
    },
  });
});

test('uses flags.config.ts with the middleware', async ({ request }) => {
  const [anonymous, alice] = await Promise.all([
    request.get('/config'),
    request.get('/config', { headers: { cookie: 'user=alice' } }),
  ]);

  expect(await anonymous.json()).toEqual({ checkout: false });
  expect(await alice.json()).toEqual({ checkout: true });
});

test('applies an override cookie', async ({ request }) => {
  const token = await encryptOverrides({ 'new-checkout': true }, FLAGS_SECRET);
  const response = await request.get('/config', {
    headers: { cookie: `flag-overrides=${token}` },
  });

  expect(await response.json()).toEqual({ checkout: true });
});

test('lets an HTTPException of Hono through', async ({ request }) => {
  const response = await request.get('/config', {
    headers: { cookie: 'blocked=1' },
  });

  expect(response.status()).toBe(403);
});
