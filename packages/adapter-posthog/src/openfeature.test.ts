import {
  ErrorCode,
  OpenFeature,
  StandardResolutionReasons,
} from '@openfeature/server-sdk';
import type { PostHog } from 'posthog-node';
import { describe, expect, it, vi } from 'vitest';
import {
  type PostHogClient,
  type PostHogFlagResult,
  PostHogProvider,
} from './openfeature';

// A PostHog client of posthog-node fits the structural client type
const _clientFits = (client: PostHog): PostHogClient => client;

function fakeClient(results: Record<string, PostHogFlagResult | undefined>) {
  return {
    getFeatureFlagResult: vi.fn(async (key: string) => results[key]),
    capture: vi.fn(),
    shutdown: vi.fn(async () => {}),
  } satisfies PostHogClient;
}

const booleanOn: PostHogFlagResult = {
  key: 'bool',
  enabled: true,
  variant: undefined,
  payload: undefined,
};
const booleanOff: PostHogFlagResult = {
  key: 'bool-off',
  enabled: false,
  variant: undefined,
  payload: undefined,
};
const disabled: PostHogFlagResult = {
  key: 'disabled',
  enabled: false,
  variant: undefined,
  payload: undefined,
  reasonCode: 'flag_disabled',
};
const multivariate: PostHogFlagResult = {
  key: 'multi',
  enabled: true,
  variant: 'test',
  payload: { color: 'blue' },
};
const withNumber: PostHogFlagResult = {
  key: 'num',
  enabled: true,
  variant: undefined,
  payload: 42,
};
const withString: PostHogFlagResult = {
  key: 'str',
  enabled: true,
  variant: undefined,
  payload: 'Hello',
};

const results = {
  bool: booleanOn,
  'bool-off': booleanOff,
  disabled,
  multi: multivariate,
  num: withNumber,
  str: withString,
};

const context = { targetingKey: 'user-1' };

describe('PostHogProvider', () => {
  it('has metadata and creates no connection', () => {
    const client = fakeClient(results);
    const provider = new PostHogProvider(client);
    expect(provider.metadata.name).toBe('posthog');
    expect(provider.runsOn).toBe('server');
    expect(client.getFeatureFlagResult).not.toHaveBeenCalled();
  });

  describe('boolean', () => {
    it('resolves whether the flag is enabled', async () => {
      const provider = new PostHogProvider(fakeClient(results));
      await expect(
        provider.resolveBooleanEvaluation('bool', false, context),
      ).resolves.toEqual({
        value: true,
        reason: StandardResolutionReasons.TARGETING_MATCH,
      });
      await expect(
        provider.resolveBooleanEvaluation('bool-off', true, context),
      ).resolves.toEqual({
        value: false,
        reason: StandardResolutionReasons.DEFAULT,
      });
    });

    it('resolves a multivariate flag to true with its variant', async () => {
      const provider = new PostHogProvider(fakeClient(results));
      await expect(
        provider.resolveBooleanEvaluation('multi', false, context),
      ).resolves.toEqual({
        value: true,
        variant: 'test',
        reason: StandardResolutionReasons.TARGETING_MATCH,
      });
    });

    it('reports a disabled flag', async () => {
      const provider = new PostHogProvider(fakeClient(results));
      await expect(
        provider.resolveBooleanEvaluation('disabled', true, context),
      ).resolves.toEqual({
        value: false,
        reason: StandardResolutionReasons.DISABLED,
      });
    });
  });

  describe('string', () => {
    it('resolves the variant key', async () => {
      const provider = new PostHogProvider(fakeClient(results));
      await expect(
        provider.resolveStringEvaluation('multi', 'control', context),
      ).resolves.toEqual({
        value: 'test',
        variant: 'test',
        reason: StandardResolutionReasons.TARGETING_MATCH,
      });
    });

    it('returns TYPE_MISMATCH for an enabled boolean flag', async () => {
      const provider = new PostHogProvider(fakeClient(results));
      await expect(
        provider.resolveStringEvaluation('bool', 'fallback', context),
      ).resolves.toMatchObject({
        value: 'fallback',
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.TYPE_MISMATCH,
      });
    });

    it('returns the default for a flag which is off', async () => {
      const provider = new PostHogProvider(fakeClient(results));
      await expect(
        provider.resolveStringEvaluation('bool-off', 'fallback', context),
      ).resolves.toEqual({
        value: 'fallback',
        reason: StandardResolutionReasons.DEFAULT,
      });
    });
  });

  describe('number', () => {
    it('resolves a number payload', async () => {
      const provider = new PostHogProvider(fakeClient(results));
      await expect(
        provider.resolveNumberEvaluation('num', 0, context),
      ).resolves.toEqual({
        value: 42,
        reason: StandardResolutionReasons.TARGETING_MATCH,
      });
    });

    it('returns TYPE_MISMATCH for a payload which is not a number', async () => {
      const provider = new PostHogProvider(fakeClient(results));
      await expect(
        provider.resolveNumberEvaluation('str', 7, context),
      ).resolves.toMatchObject({
        value: 7,
        errorCode: ErrorCode.TYPE_MISMATCH,
      });
    });

    it('returns the default without a payload', async () => {
      const provider = new PostHogProvider(fakeClient(results));
      await expect(
        provider.resolveNumberEvaluation('bool-off', 7, context),
      ).resolves.toEqual({
        value: 7,
        reason: StandardResolutionReasons.DEFAULT,
      });
    });
  });

  describe('object', () => {
    it('resolves any JSON payload', async () => {
      const provider = new PostHogProvider(fakeClient(results));
      await expect(
        provider.resolveObjectEvaluation('multi', {}, context),
      ).resolves.toEqual({
        value: { color: 'blue' },
        variant: 'test',
        reason: StandardResolutionReasons.TARGETING_MATCH,
      });
      await expect(
        provider.resolveObjectEvaluation('str', 'default', context),
      ).resolves.toEqual({
        value: 'Hello',
        reason: StandardResolutionReasons.TARGETING_MATCH,
      });
    });

    it('returns the default without a payload', async () => {
      const provider = new PostHogProvider(fakeClient(results));
      await expect(
        provider.resolveObjectEvaluation('bool', { a: 1 }, context),
      ).resolves.toEqual({
        value: { a: 1 },
        reason: StandardResolutionReasons.DEFAULT,
      });
    });
  });

  describe('errors', () => {
    it('returns FLAG_NOT_FOUND if PostHog returns no result', async () => {
      const provider = new PostHogProvider(fakeClient(results));
      await expect(
        provider.resolveBooleanEvaluation('missing', true, context),
      ).resolves.toMatchObject({
        value: true,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.FLAG_NOT_FOUND,
      });
    });

    it('returns TARGETING_KEY_MISSING without a distinct ID', async () => {
      const client = fakeClient(results);
      const provider = new PostHogProvider(client);
      await expect(
        provider.resolveBooleanEvaluation('bool', false, {}),
      ).resolves.toMatchObject({
        value: false,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.TARGETING_KEY_MISSING,
      });
      expect(client.getFeatureFlagResult).not.toHaveBeenCalled();
    });

    it('returns GENERAL if the client throws', async () => {
      const client = fakeClient(results);
      client.getFeatureFlagResult.mockRejectedValueOnce(new Error('offline'));
      const provider = new PostHogProvider(client);
      await expect(
        provider.resolveBooleanEvaluation('bool', false, context),
      ).resolves.toEqual({
        value: false,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.GENERAL,
        errorMessage: 'offline',
      });
    });
  });

  describe('evaluation context', () => {
    it('maps the context to the options of PostHog', async () => {
      const client = fakeClient(results);
      const provider = new PostHogProvider(client, {
        onlyEvaluateLocally: true,
        sendFeatureFlagEvents: false,
        disableGeoip: true,
      });
      await provider.resolveBooleanEvaluation('bool', false, {
        targetingKey: 'user-1',
        plan: 'pro',
        age: 30,
        beta: true,
        nested: { ignored: true },
        list: ['ignored'],
        groups: { company: 'acme', project: 7 },
        personProperties: { plan: 'enterprise', email: 'a@example.com' },
        groupProperties: { company: { size: 50, tags: ['ignored'] } },
      });
      expect(client.getFeatureFlagResult).toHaveBeenCalledWith(
        'bool',
        'user-1',
        {
          groups: { company: 'acme', project: '7' },
          personProperties: {
            plan: 'enterprise',
            age: 30,
            beta: true,
            email: 'a@example.com',
          },
          groupProperties: { company: { size: 50 } },
          onlyEvaluateLocally: true,
          sendFeatureFlagEvents: false,
          disableGeoip: true,
        },
      );
    });

    it('sends no options for a context with only a targeting key', async () => {
      const client = fakeClient(results);
      const provider = new PostHogProvider(client);
      await provider.resolveBooleanEvaluation('bool', false, context);
      expect(client.getFeatureFlagResult).toHaveBeenCalledWith(
        'bool',
        'user-1',
        {},
      );
    });

    it('accepts distinctId as in the v4 adapter', async () => {
      const client = fakeClient(results);
      const provider = new PostHogProvider(client);
      await expect(
        provider.resolveBooleanEvaluation('bool', false, {
          distinctId: 'user-2',
        }),
      ).resolves.toMatchObject({ value: true });
      expect(client.getFeatureFlagResult).toHaveBeenCalledWith(
        'bool',
        'user-2',
        {},
      );
    });
  });

  describe('track', () => {
    it('captures an event', () => {
      const client = fakeClient(results);
      const provider = new PostHogProvider(client);
      provider.track(
        'purchase',
        { targetingKey: 'user-1', groups: { company: 'acme' } },
        { value: 99, currency: 'USD' },
      );
      expect(client.capture).toHaveBeenCalledWith({
        distinctId: 'user-1',
        event: 'purchase',
        properties: { value: 99, currency: 'USD' },
        groups: { company: 'acme' },
      });
    });

    it('throws without a distinct ID', () => {
      const client = fakeClient(results);
      const provider = new PostHogProvider(client);
      expect(() => provider.track('purchase', {}, {})).toThrow('targetingKey');
      expect(client.capture).not.toHaveBeenCalled();
    });
  });

  describe('onClose', () => {
    it('does not shut down the client by default', async () => {
      const client = fakeClient(results);
      await new PostHogProvider(client).onClose();
      expect(client.shutdown).not.toHaveBeenCalled();
    });

    it('shuts down the client with shutdownOnClose', async () => {
      const client = fakeClient(results);
      await new PostHogProvider(client, { shutdownOnClose: true }).onClose();
      expect(client.shutdown).toHaveBeenCalledOnce();
    });
  });

  it('works with the OpenFeature SDK', async () => {
    const client = fakeClient(results);
    await OpenFeature.setProviderAndWait(new PostHogProvider(client));
    const openFeatureClient = OpenFeature.getClient();
    await expect(
      openFeatureClient.getStringDetails('multi', 'control', context),
    ).resolves.toMatchObject({
      flagKey: 'multi',
      value: 'test',
      variant: 'test',
    });
    openFeatureClient.track('signup', context, { value: 1 });
    expect(client.capture).toHaveBeenCalledWith({
      distinctId: 'user-1',
      event: 'signup',
      properties: { value: 1 },
    });
    await OpenFeature.close();
  });
});
