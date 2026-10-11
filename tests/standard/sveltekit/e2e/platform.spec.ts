import { expect, test } from '@playwright/test';

// The platform variant: flags.config.ts has no default connection, and the
// plugin of @flags-sdk/sveltekit/vite points flags/default-provider to the provider of the
// platform

test('uses the default provider of the platform', async ({ request }) => {
  const response = await request.get('/api/platform');

  expect(await response.json()).toEqual({ checkout: true });
});
