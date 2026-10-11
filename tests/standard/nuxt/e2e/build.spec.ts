import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

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
