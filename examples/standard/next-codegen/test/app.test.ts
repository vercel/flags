import assert from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { encryptOverrides } from 'flags';

// Runs the build of `pnpm build` with `next start`, and requests it

const port = 4421;
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

test('next build generated a module for each source', async () => {
  const aliases = JSON.parse(await readFile('.flags/aliases.json', 'utf8'));
  assert.deepEqual(aliases, {
    'flags:marketing': './.flags/marketing.ts',
    'flags:shop': './.flags/shop.ts',
  });
});

test('evaluates the flags of flags:<source> with the request', async () => {
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

test('writes the manifest of the generated flags for Flags Explorer', async () => {
  // The generated modules are 'use flags' modules, so the manifest has them
  const manifest = JSON.parse(
    await readFile('.next/flags-manifest.json', 'utf8'),
  );
  assert.deepEqual(Object.keys(manifest.definitions), [
    'checkout',
    'hero-text',
    'summer-sale',
  ]);
  assert.deepEqual(manifest.definitions['hero-text'].declarations, [
    { module: '.flags/marketing.ts', export: 'hero-text' },
  ]);
  assert.deepEqual(manifest.definitions.checkout.options, [
    { value: 'control' },
    { value: 'express' },
  ]);
});
