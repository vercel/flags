import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { decryptFlagValues } from 'flags';

// A build with Cache Components: a page with only known values, e.g. of
// getPrecomputed, must stay fully static, with the encrypted flag values in
// its prerendered HTML.

// 32 bytes as base64url
const FLAGS_SECRET = 'dGhpcy1pcy1hLXRlc3Qtc2VjcmV0LWZvci1mbGFncyE';
const dir = new URL('..', import.meta.url);
let output = '';

test.beforeAll(() => {
  output = execFileSync('pnpm', ['next', 'build'], {
    cwd: dir,
    env: { ...process.env, FLAGS_SECRET, NEXT_TELEMETRY_DISABLED: '1' },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
});

test.setTimeout(180_000);

test('a page with only known values is fully static', () => {
  // ○ is static, ◐ is a partial prerender with dynamic parts
  expect(output).toMatch(/○ \/values\b/);
  // The page which evaluates a flag has a dynamic part
  expect(output).toMatch(/◐ \/(\s|$)/m);
});

test('the prerendered HTML has the encrypted flag values', async () => {
  const html = readFileSync(
    new URL('.next/server/app/values.html', dir),
    'utf8',
  );
  const match = html.match(
    /<script type="application\/json" data-flag-values="">(.*?)<\/script>/,
  );
  expect(match).not.toBeNull();
  const token = JSON.parse(match?.[1] ?? '""') as string;
  expect(await decryptFlagValues(token, FLAGS_SECRET)).toEqual({
    'summer-sale': true,
  });
});
