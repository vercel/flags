import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('evaluates the flags in a load function', async ({ request }) => {
  const html = await (await request.get('/')).text();

  expect(html).toContain(
    '<pre id="flags">{"sale":true,"banner":"Summer sale!"}</pre>',
  );
});

test('registers the flags of a use flags module', async ({ request }) => {
  const response = await request.get('/api/registered');

  expect(await response.json()).toMatchObject({
    providers: expect.arrayContaining(['lazy']),
  });
});

test('has no public manifest route in production', async ({ request }) => {
  const response = await request.get('/.well-known/flags/manifest.json');

  expect(response.status()).toBe(404);
});

test('writes the manifest of the flags into the server output', () => {
  const manifest = JSON.parse(
    readFileSync('.svelte-kit/output/server/flags-manifest.json', 'utf8'),
  );

  expect(manifest).toEqual({
    version: 1,
    connections: {
      'in-memory': { system: 'in-memory', variables: {} },
    },
    definitions: {
      'banner-text': {
        type: 'string',
        options: [{ value: 'Welcome' }, { value: 'Summer sale!' }],
        defaultValue: 'Welcome',
        description: 'The text of the banner',
        declaredInCode: true,
        connection: 'in-memory',
        sources: [{ module: 'src/lib/flags.ts', export: 'bannerText' }],
      },
      'plain-flag': {
        type: 'boolean',
        declaredInCode: true,
        connection: 'in-memory',
        sources: [{ module: 'src/lib/lazy-flags.ts', export: 'plainFlag' }],
      },
      'summer-sale': {
        type: 'boolean',
        defaultValue: false,
        declaredInCode: true,
        connection: 'in-memory',
        sources: [{ module: 'src/lib/flags.ts', export: 'summerSale' }],
      },
    },
  });
});
