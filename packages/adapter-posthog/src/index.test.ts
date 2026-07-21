import type { ReadonlyHeaders, ReadonlyRequestCookies } from 'flags';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  type PostHogEntities,
  postHogAdapter,
  resetDefaultPostHogAdapter,
} from '.';

const snapshotMock = {
  getFlag: vi.fn(),
  getFlagPayload: vi.fn(),
  isEnabled: vi.fn(),
};

const postHogClientMock = {
  evaluateFlags: vi.fn(() => snapshotMock),
};

vi.mock('posthog-node', () => ({
  PostHog: vi.fn(() => postHogClientMock),
}));

const headers = {} as ReadonlyHeaders;
const cookies = {} as ReadonlyRequestCookies;
const entities: PostHogEntities = { distinctId: 'user_1' };

// `flag()` resolves an adapter with `typeof a === 'function' ? a() : a`, so
// passing `postHogAdapter` (uninvoked) and `postHogAdapter()` (invoked) both
// yield the same adapter. This mirrors that resolution without pulling in the
// full `flags/next` runtime.
function resolve(adapterOrFactory: unknown) {
  return typeof adapterOrFactory === 'function'
    ? (adapterOrFactory as () => any)()
    : adapterOrFactory;
}

describe('postHogAdapter', () => {
  it('is a callable adapter factory', () => {
    expect(postHogAdapter).toBeInstanceOf(Function);
    expect(postHogAdapter.payload).toBeInstanceOf(Function);
  });

  describe('with a missing environment', () => {
    it('should throw an error', () => {
      delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
      resetDefaultPostHogAdapter();
      expect(() => postHogAdapter()).toThrowError(
        'PostHog Adapter: Missing NEXT_PUBLIC_POSTHOG_KEY environment variable',
      );
    });
  });

  describe('with an environment', () => {
    beforeAll(() => {
      process.env.NEXT_PUBLIC_POSTHOG_KEY = 'test-posthog-key';
      process.env.NEXT_PUBLIC_POSTHOG_HOST = 'https://us.i.posthog.com';
      resetDefaultPostHogAdapter();
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('is usable invoked or uninvoked (same underlying adapter)', () => {
      const fromUninvoked = resolve(postHogAdapter);
      const fromInvoked = resolve(postHogAdapter());
      expect(fromUninvoked.adapterId).toBe(fromInvoked.adapterId);
      expect(typeof fromUninvoked.decide).toBe('function');
      expect(typeof fromUninvoked.bulkDecide).toBe('function');
    });

    it('gives the payload adapter a distinct adapterId', () => {
      expect(resolve(postHogAdapter.payload).adapterId).not.toBe(
        resolve(postHogAdapter).adapterId,
      );
    });

    describe('value adapter', () => {
      it('decides the flag value', async () => {
        snapshotMock.getFlag.mockReturnValue('test_group_1');

        const value = await postHogAdapter().decide({
          key: 'test-flag',
          headers,
          cookies,
          entities,
          defaultValue: false,
        });

        expect(value).toEqual('test_group_1');
        expect(postHogClientMock.evaluateFlags).toHaveBeenCalledWith('user_1', {
          flagKeys: ['test-flag'],
        });
      });

      it('falls back to defaultValue when the flag is missing', async () => {
        snapshotMock.getFlag.mockReturnValue(undefined);

        const value = await postHogAdapter().decide({
          key: 'missing',
          headers,
          cookies,
          entities,
          defaultValue: false,
        });

        expect(value).toBe(false);
      });

      it('returns false for a disabled flag (not the default)', async () => {
        snapshotMock.getFlag.mockReturnValue(false);

        const value = await postHogAdapter().decide({
          key: 'disabled',
          headers,
          cookies,
          entities,
          defaultValue: true,
        });

        expect(value).toBe(false);
      });

      it('throws when the flag is missing and no default is set', async () => {
        snapshotMock.getFlag.mockReturnValue(undefined);

        await expect(
          postHogAdapter().decide({
            key: 'missing',
            headers,
            cookies,
            entities,
          }),
        ).rejects.toThrow('PostHog Adapter found no value for missing');
      });

      it('bulkDecides the group in a single evaluateFlags call', async () => {
        snapshotMock.getFlag.mockImplementation((key: string) =>
          key === 'a' ? true : 'variant',
        );

        const result = await postHogAdapter().bulkDecide!({
          flags: [{ key: 'a' }, { key: 'b' }],
          entities,
          headers,
          cookies,
        });

        expect(postHogClientMock.evaluateFlags).toHaveBeenCalledTimes(1);
        expect(postHogClientMock.evaluateFlags).toHaveBeenCalledWith('user_1', {
          flagKeys: ['a', 'b'],
        });
        expect(result).toEqual({ a: true, b: 'variant' });
      });

      it('bulkDecide omits flags with no value', async () => {
        snapshotMock.getFlag.mockImplementation((key: string) =>
          key === 'a' ? true : undefined,
        );

        const result = await postHogAdapter().bulkDecide!({
          flags: [{ key: 'a' }, { key: 'b' }],
          entities,
          headers,
          cookies,
        });

        expect(result).toEqual({ a: true });
      });
    });

    describe('payload adapter', () => {
      it('decides the flag payload', async () => {
        snapshotMock.getFlagPayload.mockReturnValue({ text: 'hello world' });

        const value = await postHogAdapter.payload().decide({
          key: 'test-flag',
          headers,
          cookies,
          entities,
          defaultValue: {},
        });

        expect(value).toEqual({ text: 'hello world' });
        expect(postHogClientMock.evaluateFlags).toHaveBeenCalledWith('user_1', {
          flagKeys: ['test-flag'],
        });
      });

      it('falls back to defaultValue when there is no payload', async () => {
        snapshotMock.getFlagPayload.mockReturnValue(undefined);

        const value = await postHogAdapter.payload().decide({
          key: 'missing',
          headers,
          cookies,
          entities,
          defaultValue: { fallback: true },
        });

        expect(value).toEqual({ fallback: true });
      });

      it('bulkDecides payloads in a single evaluateFlags call', async () => {
        snapshotMock.getFlagPayload.mockImplementation((key: string) =>
          key === 'a' ? { a: 1 } : undefined,
        );

        const result = await postHogAdapter.payload().bulkDecide!({
          flags: [{ key: 'a' }, { key: 'b' }],
          entities,
          headers,
          cookies,
        });

        expect(postHogClientMock.evaluateFlags).toHaveBeenCalledTimes(1);
        expect(postHogClientMock.evaluateFlags).toHaveBeenCalledWith('user_1', {
          flagKeys: ['a', 'b'],
        });
        expect(result).toEqual({ a: { a: 1 } });
      });
    });
  });
});

describe('default adapter evaluation mode', () => {
  const OLD_ENV = process.env;

  beforeAll(() => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'test-posthog-key';
    process.env.NEXT_PUBLIC_POSTHOG_HOST = 'https://us.i.posthog.com';
  });

  afterEach(() => {
    process.env = OLD_ENV;
    vi.resetModules();
  });

  // The default adapter is memoized and reads env lazily on first use, so each
  // case starts from a fresh module registry to construct a new singleton.
  async function constructDefaultAdapter() {
    vi.resetModules();
    const { PostHog } = await import('posthog-node');
    const { postHogAdapter: freshAdapter } = await import('.');
    // Invoking the adapter constructs the underlying PostHog client.
    freshAdapter();
    return vi.mocked(PostHog).mock.calls.at(-1)?.[1] ?? {};
  }

  it('evaluates remotely by default (no secret key, no local evaluation)', async () => {
    process.env = { ...OLD_ENV };
    delete process.env.POSTHOG_SECRET_KEY;

    const options = await constructDefaultAdapter();

    expect(options.secretKey).toBeUndefined();
    expect(options.personalApiKey).toBeUndefined();
    expect(options.enableLocalEvaluation).toBe(false);
  });

  it('does not enable local evaluation from POSTHOG_PERSONAL_API_KEY', async () => {
    process.env = { ...OLD_ENV };
    delete process.env.POSTHOG_SECRET_KEY;
    process.env.POSTHOG_PERSONAL_API_KEY = 'phx_personal';

    const options = await constructDefaultAdapter();

    expect(options.secretKey).toBeUndefined();
    expect(options.personalApiKey).toBeUndefined();
    expect(options.enableLocalEvaluation).toBe(false);
  });

  it('enables local evaluation when POSTHOG_SECRET_KEY is set', async () => {
    process.env = { ...OLD_ENV };
    process.env.POSTHOG_SECRET_KEY = 'phs_secret';

    const options = await constructDefaultAdapter();

    expect(options.secretKey).toBe('phs_secret');
    expect(options.enableLocalEvaluation).toBe(true);
  });
});
