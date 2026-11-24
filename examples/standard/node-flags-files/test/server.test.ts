import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { runtime } from 'flags/runtime';
import { checkout, summerSale } from '../src/app.flags';
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

async function get(cookie?: string) {
  const response = await fetch(base, {
    headers: cookie ? { cookie } : {},
  });
  assert.equal(response.status, 200);
  return response.json();
}

test('compiles the flags file into flags with their keys', () => {
  assert.equal(summerSale.key, 'summer-sale');
  assert.equal(checkout.key, 'checkout');
  assert.deepEqual(
    checkout.options?.map((option) => option.value),
    ['control', 'express'],
  );
});

test('writes the declaration file of the flags file', () => {
  // flags/register writes it when it compiles app.flags, for editors with
  // an older TypeScript and for tsc
  const declaration = readFileSync(
    new URL('../src/app.d.flags.ts', import.meta.url),
    'utf8',
  );
  assert.match(declaration, /summerSale/);
  assert.match(declaration, /checkout/);
});

test('evaluates the flags with the context of the request', async () => {
  assert.deepEqual(await get('user=alice'), {
    sale: true,
    checkout: 'control',
  });
  assert.deepEqual(await get('user=bob; beta=1'), {
    sale: false,
    checkout: 'express',
  });
  assert.deepEqual(await get(), { sale: false, checkout: 'control' });
});
