import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { encryptOverrides } from 'flags';
import { FLAGS_SECRET } from '../playwright.config';

test('uses flags.config.ts with the middleware', async ({ request }) => {
  const [anonymous, alice] = await Promise.all([
    request.get('/'),
    request.get('/', { headers: { cookie: 'user=alice' } }),
  ]);

  expect(await anonymous.json()).toEqual({ checkout: false, text: 'Hi' });
  expect(await alice.json()).toMatchObject({ checkout: true });
});

test('keeps the request in a later step of an async handler', async ({
  request,
}) => {
  const response = await request.get('/later', {
    headers: { cookie: 'user=alice' },
  });

  expect(await response.json()).toEqual({ checkout: true });
});

test('applies an override cookie', async ({ request }) => {
  const token = await encryptOverrides({ 'new-checkout': true }, FLAGS_SECRET);
  const response = await request.get('/', {
    headers: { cookie: `flag-overrides=${token}` },
  });

  expect(await response.json()).toMatchObject({ checkout: true });
});

test('the script writes the manifest of the flags', () => {
  const manifest = JSON.parse(readFileSync('flags-manifest.json', 'utf8'));

  expect(Object.keys(manifest.definitions)).toEqual([
    'greeting',
    'new-checkout',
  ]);
  expect(manifest.connections).toEqual({
    'in-memory': { system: 'in-memory', variables: {} },
  });
});
