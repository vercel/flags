import type { ReadonlyHeaders, ReadonlyRequestCookies } from 'flags';
import { expect, it, describe, vi, beforeAll } from 'vitest';
import { ldAdapter, type LDContext } from '.';

const ldClientMock = {
  waitForInitialization: vi.fn(),
  variation: vi.fn(),
};

vi.mock('@launchdarkly/vercel-server-sdk', () => ({
  init: vi.fn(() => ldClientMock),
}));

vi.mock('@vercel/edge-config', () => ({
  createClient: vi.fn(),
}));

describe('ldAdapter', () => {
  it('should variation should be a function', () => {
    expect(ldAdapter.variation).toBeInstanceOf(Function);
  });

  describe('with a missing environment', () => {
    it('should throw an error', () => {
      expect(() => ldAdapter.variation()).toThrowError(
        'LaunchDarkly Adapter: Missing EDGE_CONFIG environment variable',
      );
    });
  });

  describe('with an environment', () => {
    beforeAll(() => {
      process.env.LAUNCHDARKLY_PROJECT_SLUG = 'test-project';
      process.env.LAUNCHDARKLY_CLIENT_SIDE_ID = 'test-client-side-id';
      process.env.EDGE_CONFIG = 'https://edge-config.com/test-edge-config';
    });

    it('should expose the ldClient', () => {
      expect(ldAdapter).toHaveProperty('ldClient');
    });

    describe('variation', () => {
      it('should return the origin', () => {
        const v = ldAdapter.variation();
        expect(typeof v.origin).toEqual('function');

        if (typeof v.origin !== 'function')
          throw new Error('origin is not a function');

        expect(v.origin?.('test-flag')).toEqual(
          'https://app.launchdarkly.com/projects/test-project/flags/test-flag/',
        );
      });
      it('should decide', async () => {
        ldClientMock.variation.mockReturnValue(true);

        const valuePromise = ldAdapter.variation().decide({
          key: 'test-flag',
          headers: {} as ReadonlyHeaders,
          cookies: {} as ReadonlyRequestCookies,
          entities: {} as LDContext,
          defaultValue: false,
        });

        await expect(valuePromise).resolves.toEqual(true);
        expect(ldClientMock.variation).toHaveBeenCalled();
      });
    });
  });
});
