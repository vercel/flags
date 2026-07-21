import type { ReadonlyHeaders, ReadonlyRequestCookies } from 'flags';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { type PostHogEntities, postHogAdapter } from '.';

const postHogClientMock = {
  isFeatureEnabled: vi.fn(),
  getFeatureFlag: vi.fn(),
  getFeatureFlagPayload: vi.fn(),
  getRemoteConfigPayload: vi.fn(),
};

vi.mock('posthog-node', () => ({
  PostHog: vi.fn(() => postHogClientMock),
}));

describe('postHogAdapter', () => {
  it('isFeatureEnabled should be a function', () => {
    expect(postHogAdapter.isFeatureEnabled).toBeInstanceOf(Function);
  });

  describe('with a missing environment', () => {
    it('should throw an error', () => {
      expect(() => postHogAdapter.isFeatureEnabled()).toThrowError(
        'PostHog Adapter: Missing NEXT_PUBLIC_POSTHOG_KEY environment variable',
      );
    });
  });

  describe('with an environment', () => {
    beforeAll(() => {
      process.env.NEXT_PUBLIC_POSTHOG_KEY = 'test-posthog-key';
      process.env.NEXT_PUBLIC_POSTHOG_HOST = 'https://us.i.posthog.com';
    });

    describe('isFeatureEnabled', () => {
      it('should decide', async () => {
        postHogClientMock.isFeatureEnabled.mockReturnValue(true);

        const valuePromise = postHogAdapter.isFeatureEnabled().decide({
          key: 'test-flag',
          headers: {} as ReadonlyHeaders,
          cookies: {} as ReadonlyRequestCookies,
          entities: {} as PostHogEntities,
          defaultValue: false,
        });

        await expect(valuePromise).resolves.toEqual(true);
        expect(postHogClientMock.isFeatureEnabled).toHaveBeenCalled();
      });
    });

    describe('featureValue', () => {
      it('should decide', async () => {
        postHogClientMock.getFeatureFlag.mockReturnValue('test_group_1');

        const valuePromise = postHogAdapter.featureFlagValue().decide({
          key: 'test-flag',
          headers: {} as ReadonlyHeaders,
          cookies: {} as ReadonlyRequestCookies,
          entities: {} as PostHogEntities,
          defaultValue: false,
        });

        await expect(valuePromise).resolves.toEqual('test_group_1');
        expect(postHogClientMock.getFeatureFlag).toHaveBeenCalled();
      });
    });

    describe('featurePayload', () => {
      it('should decide', async () => {
        postHogClientMock.getFeatureFlag.mockReturnValue('test_group_1');
        postHogClientMock.getFeatureFlagPayload.mockReturnValue({
          text: 'hello world',
        });

        const valuePromise = postHogAdapter
          .featureFlagPayload<string>(
            (payload) => (payload as { text: string }).text,
          )
          .decide({
            key: 'test-flag',
            headers: {} as ReadonlyHeaders,
            cookies: {} as ReadonlyRequestCookies,
            entities: {} as PostHogEntities,
            defaultValue: 'default',
          });

        await expect(valuePromise).resolves.toEqual('hello world');
        expect(postHogClientMock.getFeatureFlag).toHaveBeenCalled();
        expect(postHogClientMock.getFeatureFlagPayload).toHaveBeenCalled();
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
    // Accessing a method constructs the underlying PostHog client synchronously.
    freshAdapter.isFeatureEnabled();
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
