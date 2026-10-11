import { describe, expect, it } from 'vitest';
import { toFlagsRequest } from './index';

describe('the Express middleware', () => {
  it('converts the headers and the URL of a Node.js request', () => {
    const init = toFlagsRequest({
      headers: {
        host: 'shop.example',
        cookie: 'user=alice',
        'x-list': ['a', 'b'],
        'x-missing': undefined,
      },
      originalUrl: '/cart?step=2',
      protocol: 'https',
    });

    expect(init.headers?.get('cookie')).toBe('user=alice');
    expect(init.headers?.get('x-list')).toBe('a, b');
    expect(init.headers?.has('x-missing')).toBe(false);
    expect(String(init.url)).toBe('https://shop.example/cart?step=2');
  });
});
