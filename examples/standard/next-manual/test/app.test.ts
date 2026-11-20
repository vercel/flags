import assert from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { encryptOverrides } from 'flags/explorer';

// Runs the build of `pnpm build` with `next start`, and requests it

const port = 4411;
const base = `http://localhost:${port}`;
// Only for this test: 32 random bytes as base64url
const secret = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(
  'base64url',
);

let server: ChildProcess;

before(async () => {
  server = spawn('pnpm', ['exec', 'next', 'start', '--port', String(port)], {
    env: { ...process.env, FLAGS_SECRET: secret },
    stdio: 'ignore',
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await fetch(base);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error('next start did not start');
});

after(() => {
  server.kill();
});

async function flagsOfPage(cookie: string) {
  const html = await (await fetch(base, { headers: { cookie } })).text();
  const match = /<pre id="flags">(.*?)<\/pre>/.exec(html);
  assert.ok(match, 'the page has the flags');
  return JSON.parse((match[1] ?? '').replaceAll('&quot;', '"'));
}

test('evaluates the flags with the request of the page', async () => {
  assert.deepEqual(await flagsOfPage('user=alice'), {
    sale: true,
    flow: 'express',
    beta: false,
  });
  assert.deepEqual(await flagsOfPage('user=carol; beta=1'), {
    sale: false,
    flow: 'express',
    beta: true,
  });
});

test('returns a value which is not one of the options', async () => {
  assert.equal((await flagsOfPage('user=bob')).flow, 'one-click');
});

test('applies overrides of Flags Explorer', async () => {
  const token = await encryptOverrides(
    { 'summer-sale': true, 'beta-banner': true },
    secret,
  );
  assert.deepEqual(await flagsOfPage(`user=carol; flag-overrides=${token}`), {
    sale: true,
    flow: 'express',
    beta: true,
  });
});

test('writes the manifest of the flags for Flags Explorer', async () => {
  // The route of the manifest is only for development
  assert.equal(
    (await fetch(`${base}/.well-known/flags/manifest.json`)).status,
    404,
  );

  // next build writes the manifest of the 'use flags' modules
  const manifest = JSON.parse(
    await readFile('.next/flags-manifest.json', 'utf8'),
  );
  assert.deepEqual(Object.keys(manifest.definitions), [
    'beta-banner',
    'checkout',
    'summer-sale',
  ]);
  assert.deepEqual(manifest.definitions.checkout, {
    type: 'string',
    options: [{ value: 'control' }, { value: 'express' }],
    defaultValue: 'control',
    description: 'The checkout flow',
    declaredInCode: true,
    source: 'in-memory',
    declarations: [{ module: 'flags.ts', export: 'checkout' }],
  });
});
