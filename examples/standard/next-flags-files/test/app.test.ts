import assert from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { encryptOverrides } from 'flags/explorer';

// Runs the build of `pnpm build` with `next start`, and requests it

const port = 4431;
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

test('writes the types of each flags file for TypeScript before 7.1', async () => {
  const types = await readFile('app.d.flags.ts', 'utf8');
  assert.match(types, /export \{ flag_0 as summerSale \};/);
  assert.match(types, /export \{ flag_1 as checkout \};/);
  assert.match(
    await readFile('app/marketing.d.flags.ts', 'utf8'),
    /export \{ flag_0 as heroText \};/,
  );
});

test('evaluates the flags of the flags files with the request', async () => {
  assert.deepEqual(await flagsOfPage('user=alice'), {
    sale: true,
    flow: 'express',
    hero: 'Welcome',
  });
  assert.deepEqual(await flagsOfPage('user=bob; visited=1'), {
    sale: false,
    flow: 'express',
    hero: 'Hello again',
  });
});

test('applies overrides of Flags Explorer', async () => {
  const token = await encryptOverrides({ checkout: 'control' }, secret);
  assert.equal((await flagsOfPage(`flag-overrides=${token}`)).flow, 'control');
});

test('writes the manifest of the flags files for Flags Explorer', async () => {
  // A flags file is a flags module, so the manifest has its flags
  const manifest = JSON.parse(
    await readFile('.next/flags-manifest.json', 'utf8'),
  );
  assert.deepEqual(Object.keys(manifest.definitions), [
    'checkout',
    'hero-text',
    'summer-sale',
  ]);
  assert.deepEqual(manifest.definitions['hero-text'].declarations, [
    { module: 'app/marketing.flags', export: 'heroText' },
  ]);
  assert.deepEqual(manifest.definitions.checkout.options, [
    { value: 'control' },
    { value: 'express', label: 'Express checkout' },
  ]);
  assert.equal(
    manifest.definitions['summer-sale'].description,
    'Shows the summer sale banner',
  );
});
