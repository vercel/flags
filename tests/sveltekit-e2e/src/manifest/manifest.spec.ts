import { expect, test } from '@playwright/test';
import { port } from '../port';

test('serves the manifest of the flags in development', async ({ request }) => {
  const response = await request.get(
    `http://localhost:${port}/.well-known/flags/manifest.json`,
  );

  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe('no-store');
  const manifest = await response.json();
  // The flags of src/lib/flags.ts, which has the 'use flags' directive
  expect(Object.keys(manifest.definitions)).toEqual([
    'cookie',
    'host',
    'precomputedFlag',
    'showDashboard',
  ]);
  expect(manifest.definitions.showDashboard).toEqual({
    type: 'boolean',
    options: [{ value: true }, { value: false }],
    description: 'Show the dashboard',
    declaredInCode: true,
    declarations: [{ module: 'src/lib/flags.ts', export: 'showDashboard' }],
  });
});
