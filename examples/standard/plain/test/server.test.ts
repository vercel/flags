import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { runtime } from 'flags';
import { createServer } from '../src/server.ts';

let base: string;
let close: () => void;

before(async () => {
  const server = await createServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});

after(async () => {
  close();
  await runtime.onShutdown();
});

async function get(path: string, user?: string) {
  const response = await fetch(`${base}${path}`, {
    headers: user ? { cookie: `user=${user}` } : {},
  });
  assert.equal(response.status, 200);
  return response.json();
}

test('evaluates the flags of a source with the context of the request', async () => {
  assert.deepEqual(await get('/', 'alice'), {
    sale: true,
    banner: 'Summer sale!',
    insights: null,
  });
  assert.deepEqual(await get('/', 'bob'), {
    sale: false,
    banner: 'Welcome',
    insights: null,
  });
});

test('runs the context chain from the call side to the source', async () => {
  assert.equal((await get('/?team=acme', 'bob')).insights, true);
  assert.equal((await get('/?team=tiny', 'bob')).insights, false);
});
