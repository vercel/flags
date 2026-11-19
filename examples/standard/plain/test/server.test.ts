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

async function get(path: string, cookie?: string) {
  const response = await fetch(`${base}${path}`, {
    headers: cookie ? { cookie } : {},
  });
  assert.equal(response.status, 200);
  return response.json();
}

test('evaluates the flags of a source with the context of the request', async () => {
  assert.deepEqual(await get('/', 'user=alice'), {
    sale: true,
    banner: 'Summer sale!',
    beta: false,
    insights: null,
  });
  assert.deepEqual(await get('/', 'user=bob'), {
    sale: false,
    banner: 'Welcome',
    beta: false,
    insights: null,
  });
});

test('runs the context chain from the call side to the source', async () => {
  assert.equal((await get('/?team=acme', 'user=bob')).insights, true);
  assert.equal((await get('/?team=tiny', 'user=bob')).insights, false);
});

test('decides an inline flag in the code', async () => {
  assert.equal((await get('/', 'user=bob; beta=1')).beta, true);
});
