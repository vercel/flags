import { beforeAll, describe, expect, it, vi } from 'vitest';

// Issue #3: when a flag is evaluated with no argument, it resolves the request
// through `getStartRequest()`. The per-request dedupe is keyed on that Request
// instance, so it only works if `getStartRequest()` returns a STABLE instance
// within a single request. Here we mock it to return one shared Request and
// assert that two no-arg evaluations share a single `decide` call.
//
// NOTE: this proves the adapter dedupes correctly given a stable request. In
// production, confirm TanStack Start's `getRequest()` returns the same Request
// instance across calls within a request (it should, via the server request
// context); if it ever returns a fresh wrapper, switch the context keying to an
// AsyncLocalStorage-based store instead of the Request instance.
const sharedRequest = new Request('http://localhost/shared');
vi.mock('./get-request', () => ({
  getStartRequest: async () => sharedRequest,
}));

import { flag } from '.';

beforeAll(() => {
  process.env.FLAGS_SECRET = 'a'.repeat(43);
});

describe('getStartRequest dedupe', () => {
  it('deduplicates decide across no-arg calls sharing one request', async () => {
    let calls = 0;
    const f = flag<number>({ key: 'gr-dedupe', decide: () => ++calls });
    const [a, b] = await Promise.all([f(), f()]);
    expect(a).toBe(b);
    expect(calls).toBe(1);
  });

  it('reuses the cached value on a later no-arg call too', async () => {
    let calls = 0;
    const f = flag<number>({ key: 'gr-dedupe-2', decide: () => ++calls });
    const first = await f();
    const second = await f();
    expect(first).toBe(second);
    expect(calls).toBe(1);
  });
});
