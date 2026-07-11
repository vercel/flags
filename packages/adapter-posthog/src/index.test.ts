import type { ReadonlyHeaders, ReadonlyRequestCookies } from 'flags';
import { PostHog } from 'posthog-node';
import { beforeAll, describe, expect, it, vi } from 'vitest';
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
      // Present because provider data discovery needs it, but it must not leak
      // into the runtime client. See issue #393.
      process.env.POSTHOG_PERSONAL_API_KEY = 'phx_test_personal_api_key';
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

    // Regression test for issue #393: the default adapter must not forward
    // `POSTHOG_PERSONAL_API_KEY` into the runtime `posthog-node` client, because
    // that enables local evaluation and starts a per-process feature-flag poller.
    describe('default runtime client options', () => {
      it('should not enable local evaluation from POSTHOG_PERSONAL_API_KEY', () => {
        expect(PostHog).toHaveBeenCalled();
        const options = vi.mocked(PostHog).mock.calls[0]?.[1] ?? {};
        expect(options).not.toHaveProperty('personalApiKey');
        expect(options).not.toHaveProperty('featureFlagsPollingInterval');
      });
    });
  });
});
