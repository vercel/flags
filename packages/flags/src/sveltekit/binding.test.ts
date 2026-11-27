import { describe, expect, it } from 'vitest';
import { flagStorage, svelteKitBinding } from './binding';

function contextFor(request: Request) {
  return {
    request,
    secret: undefined,
    params: {},
    usedFlags: {},
    identifiers: new Map(),
  };
}

describe('the binding of flags/sveltekit', () => {
  it('gives the request of the scope of createHandle', async () => {
    const request = new Request('https://shop.example', {
      headers: { cookie: 'user=alice', 'x-test': '1' },
    });

    await flagStorage.run(contextFor(request), async () => {
      const { headers, cookies } = await svelteKitBinding.getRequest();
      expect(headers.get('x-test')).toBe('1');
      expect(cookies.get('user')?.value).toBe('alice');
      // The same sealed headers for each call of one request
      expect(await svelteKitBinding.getHeaders()).toBe(headers);
    });
  });

  it('throws outside of a request, as flag() did before', async () => {
    await expect(svelteKitBinding.getRequest()).rejects.toThrow(
      'flags: Neither context found nor Request provided',
    );
  });
});
