import { expect, test } from '@playwright/test';
import { port } from '../port';

test('serves the manifest of the flags in development', async ({ request }) => {
  const response = await request.get(
    `http://localhost:${port}/.well-known/flags/manifest.json`,
  );

  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe('no-store');
  const manifest = await response.json();
  // The flags of flags.tsx, which has the 'use flags' directive
  expect(Object.keys(manifest.definitions)).toEqual([
    'cookie',
    'example-flag',
    'host',
  ]);
  expect(manifest.definitions['example-flag']).toEqual({
    type: 'boolean',
    options: [{ value: false }, { value: true }],
    defaultValue: false,
    declaredInCode: true,
    declarations: [{ module: 'flags.tsx', export: 'exampleFlag' }],
  });
});
