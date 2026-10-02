import { afterEach, describe, expect, it, vi } from 'vitest';
import { isDebugEnabled } from '../utils/debug-enabled';
import { debug } from './debug';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('isDebugEnabled', () => {
  it.each([
    [undefined, false],
    ['', false],
    ['0', false],
    ['other', false],
    ['@vercel/flags-core-extra', false],
    ['@vercel/flags-core', true],
    ['other,@vercel/flags-core', true],
    ['other @vercel/flags-core', true],
    ['*', true],
    ['@vercel/*', true],
    ['*,-@vercel/flags-core', false],
    ['-@vercel/flags-core', false],
    ['@vercel/flags-core,-@vercel/*', false],
  ])('treats DEBUG=%s as %s', (value, enabled) => {
    vi.stubEnv('DEBUG', value);
    expect(isDebugEnabled()).toBe(enabled);
  });

  it('follows runtime changes to DEBUG', () => {
    vi.stubEnv('DEBUG', '');
    expect(isDebugEnabled()).toBe(false);
    vi.stubEnv('DEBUG', '@vercel/flags-core');
    expect(isDebugEnabled()).toBe(true);
    vi.stubEnv('DEBUG', 'other');
    expect(isDebugEnabled()).toBe(false);
  });
});

describe('debug', () => {
  it('computes details lazily and only when enabled', () => {
    const output = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const details = vi.fn(() => ({ ageMs: 1 }));
    vi.stubEnv('DEBUG', 'other');
    debug('checkout', 'test.event', details);
    expect(details).not.toHaveBeenCalled();
    expect(output).not.toHaveBeenCalled();

    vi.stubEnv('DEBUG', '@vercel/flags-core');
    debug('checkout', 'test.event', details);
    expect(details).toHaveBeenCalledOnce();
    expect(output).toHaveBeenCalledExactlyOnceWith('@vercel/flags-core', {
      event: 'test.event',
      clientName: 'checkout',
      ageMs: 1,
    });
  });

  it('swallows console and detail errors', () => {
    vi.stubEnv('DEBUG', '@vercel/flags-core');
    vi.spyOn(console, 'debug').mockImplementation(() => {
      throw new Error('closed stream');
    });
    expect(() => debug(undefined, 'test.event')).not.toThrow();
    expect(() =>
      debug(undefined, 'test.event', () => {
        throw new Error('broken details');
      }),
    ).not.toThrow();
  });
});
