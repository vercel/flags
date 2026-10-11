import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

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
    definitions: {
      'banner-text': {
        type: 'string',
        defaultValue: 'Welcome',
        description: 'The text of the banner',
        declaredInCode: true,
        sources: [{ module: 'src/flags.ts', export: 'bannerText' }],
      },
      'summer-sale': {
        type: 'boolean',
        defaultValue: false,
        declaredInCode: true,
        sources: [{ module: 'src/flags.ts', export: 'summerSale' }],
      },
    },
  });
});
