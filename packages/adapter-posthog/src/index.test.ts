import type { ReadonlyHeaders, ReadonlyRequestCookies } from 'flags';
import { expect, it, describe, vi, beforeAll } from 'vitest';
import { postHogAdapter, type PostHogEntities } from '.';

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
