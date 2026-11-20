import { ErrorCode, OpenFeature } from '@openfeature/server-sdk';
import type { Statsig, StatsigUser } from '@statsig/statsig-node-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StatsigProvider, toStatsigUserArgs } from './openfeature';

interface FakeEntity {
  value: unknown;
  ruleID?: string;
  reason?: string;
  groupName?: string | null;
  allocatedExperimentName?: string | null;
}

/**
 * A structural fake of the Statsig instance. It records the calls.
 */
function createFakeStatsig(entities: {
  gates?: Record<string, FakeEntity>;
  configs?: Record<string, FakeEntity>;
  experiments?: Record<string, FakeEntity>;
  layers?: Record<string, FakeEntity>;
}) {
  const calls: { method: string; user: StatsigUser; args: unknown[] }[] = [];
  const layerExposures: string[] = [];

  function lookup(
    map: Record<string, FakeEntity> | undefined,
    name: string,
    emptyValue: unknown,
  ) {
    const entity = map?.[name];
    if (!entity) {
      return {
        name,
        value: emptyValue,
        ruleID: '',
        groupName: null,
        allocatedExperimentName: null,
        details: { reason: 'Network:Unrecognized' },
      };
    }
    return {
      name,
      value: entity.value,
      ruleID: entity.ruleID ?? 'rule-1',
      groupName: entity.groupName ?? null,
      allocatedExperimentName: entity.allocatedExperimentName ?? null,
      details: { reason: entity.reason ?? 'Network:Recognized' },
    };
  }

  const fake = {
    initialize: vi.fn(async () => ({ isSuccess: true })),
    shutdown: vi.fn(async () => ({ isSuccess: true })),
    logEvent: vi.fn(),
    getFeatureGate: (user: StatsigUser, name: string, options?: unknown) => {
      calls.push({ method: 'getFeatureGate', user, args: [name, options] });
      return lookup(entities.gates, name, false);
    },
    getDynamicConfig: (user: StatsigUser, name: string, options?: unknown) => {
      calls.push({ method: 'getDynamicConfig', user, args: [name, options] });
      return lookup(entities.configs, name, {});
    },
    getExperiment: (user: StatsigUser, name: string, options?: unknown) => {
      calls.push({ method: 'getExperiment', user, args: [name, options] });
      return lookup(entities.experiments, name, {});
    },
    getLayer: (user: StatsigUser, name: string, options?: unknown) => {
      calls.push({ method: 'getLayer', user, args: [name, options] });
      const result = lookup(entities.layers, name, {});
      const value = result.value as Record<string, unknown>;
      return {
        ...result,
        __value: value,
        getValue: (param: string) => {
          layerExposures.push(param);
          return value[param] ?? null;
        },
      };
    },
  };

  return {
    fake,
    statsig: fake as unknown as Statsig,
    calls,
    layerExposures,
  };
}

const entities = {
  gates: {
    show_banner: { value: true, ruleID: 'rule-banner' },
    off_gate: { value: false, ruleID: 'default' },
  },
  configs: {
    welcome: {
      value: { text: 'Hello', count: 3, enabled: true, nested: { a: 1 } },
      ruleID: 'rule-config',
    },
  },
  experiments: {
    pricing: {
      value: { price: 9.99, label: 'cheap' },
      ruleID: 'rule-exp',
      groupName: 'Test',
    },
  },
  layers: {
    checkout: {
      value: { color: 'blue' },
      ruleID: 'rule-layer',
      groupName: 'Control',
      allocatedExperimentName: 'checkout_exp',
    },
  },
};

const context = { targetingKey: 'user-1' };

describe('StatsigProvider: key mapping', () => {
  it('resolves a plain key as a feature gate', async () => {
    const { statsig, calls } = createFakeStatsig(entities);
    const provider = new StatsigProvider(statsig);
    const result = await provider.resolveBooleanEvaluation(
      'show_banner',
      false,
      context,
    );
    expect(result).toEqual({
      value: true,
      reason: 'TARGETING_MATCH',
      variant: 'rule-banner',
      flagMetadata: {
        ruleID: 'rule-banner',
        statsigReason: 'Network:Recognized',
      },
    });
    expect(calls[0]?.method).toBe('getFeatureGate');
    expect(calls[0]?.args).toEqual([
      'show_banner',
      { disableExposureLogging: false },
    ]);
  });

  it('resolves gate: as a feature gate', async () => {
    const { statsig } = createFakeStatsig(entities);
    const provider = new StatsigProvider(statsig);
    const result = await provider.resolveBooleanEvaluation(
      'gate:off_gate',
      true,
      context,
    );
    expect(result.value).toBe(false);
    expect(result.reason).toBe('DEFAULT');
  });

  it('reads parameters of a dynamic config', async () => {
    const { statsig } = createFakeStatsig(entities);
    const provider = new StatsigProvider(statsig);
    await expect(
      provider.resolveStringEvaluation('config:welcome.text', '', context),
    ).resolves.toMatchObject({ value: 'Hello', variant: 'rule-config' });
    await expect(
      provider.resolveNumberEvaluation('config:welcome.count', 0, context),
    ).resolves.toMatchObject({ value: 3 });
    await expect(
      provider.resolveBooleanEvaluation(
        'config:welcome.enabled',
        false,
        context,
      ),
    ).resolves.toMatchObject({ value: true });
    await expect(
      provider.resolveObjectEvaluation('config:welcome.nested', {}, context),
    ).resolves.toMatchObject({ value: { a: 1 } });
  });

  it('returns the whole value object without a parameter', async () => {
    const { statsig } = createFakeStatsig(entities);
    const provider = new StatsigProvider(statsig);
    const result = await provider.resolveObjectEvaluation(
      'config:welcome',
      {},
      context,
    );
    expect(result.value).toEqual(entities.configs.welcome.value);
  });

  it('reads experiments with the group name as the variant', async () => {
    const { statsig, calls } = createFakeStatsig(entities);
    const provider = new StatsigProvider(statsig);
    const result = await provider.resolveNumberEvaluation(
      'experiment:pricing.price',
      0,
      context,
    );
    expect(result).toEqual({
      value: 9.99,
      reason: 'SPLIT',
      variant: 'Test',
      flagMetadata: {
        ruleID: 'rule-exp',
        statsigReason: 'Network:Recognized',
        groupName: 'Test',
      },
    });
    expect(calls[0]?.method).toBe('getExperiment');
  });

  it('reads layers and logs the parameter exposure', async () => {
    const { statsig, layerExposures } = createFakeStatsig(entities);
    const provider = new StatsigProvider(statsig);
    const result = await provider.resolveStringEvaluation(
      'layer:checkout.color',
      'red',
      context,
    );
    expect(result).toMatchObject({
      value: 'blue',
      variant: 'Control',
      flagMetadata: { allocatedExperimentName: 'checkout_exp' },
    });
    expect(layerExposures).toEqual(['color']);
  });

  it('needs a parameter for a layer', async () => {
    const { statsig } = createFakeStatsig(entities);
    const provider = new StatsigProvider(statsig);

    await expect(
      provider.resolveObjectEvaluation('layer:checkout', {}, context),
    ).rejects.toMatchObject({ code: 'PARSE_ERROR' });
  });

  it('returns the default value for a missing parameter', async () => {
    const { statsig } = createFakeStatsig(entities);
    const provider = new StatsigProvider(statsig);
    const result = await provider.resolveStringEvaluation(
      'experiment:pricing.missing',
      'fallback',
      context,
    );
    expect(result.value).toBe('fallback');
    expect(result.reason).toBe('DEFAULT');
  });

  it('passes disableExposureLogging to Statsig', async () => {
    const { statsig, calls } = createFakeStatsig(entities);
    const provider = new StatsigProvider(statsig, {
      disableExposureLogging: true,
    });
    await provider.resolveBooleanEvaluation('show_banner', false, context);
    expect(calls[0]?.args[1]).toEqual({ disableExposureLogging: true });
  });
});

describe('StatsigProvider: errors', () => {
  function provider() {
    return new StatsigProvider(createFakeStatsig(entities).statsig);
  }

  it.each([
    ['a gate as a string', 'show_banner', 'string'],
    ['a gate as an object', 'show_banner', 'object'],
    ['a config without a parameter as a string', 'config:welcome', 'string'],
    ['a config without a parameter as a boolean', 'config:welcome', 'boolean'],
    ['a string parameter as a number', 'config:welcome.text', 'number'],
    ['a number parameter as a boolean', 'config:welcome.count', 'boolean'],
  ] as const)('reports TYPE_MISMATCH for %s', async (_name, key, type) => {
    await expect(resolve(provider(), key, type)).rejects.toMatchObject({
      code: ErrorCode.TYPE_MISMATCH,
    });
  });

  it.each([
    'unknown:thing',
    'config:',
    'config:welcome.',
    'show_banner.param',
    '.param',
  ])('reports PARSE_ERROR for the key %s', async (key) => {
    await expect(resolve(provider(), key, 'boolean')).rejects.toMatchObject({
      code: ErrorCode.PARSE_ERROR,
    });
  });

  it('reports FLAG_NOT_FOUND for an unknown entity', async () => {
    await expect(
      resolve(provider(), 'missing_gate', 'boolean'),
    ).rejects.toMatchObject({ code: ErrorCode.FLAG_NOT_FOUND });
    await expect(
      resolve(provider(), 'experiment:missing.x', 'string'),
    ).rejects.toMatchObject({ code: ErrorCode.FLAG_NOT_FOUND });
  });

  it('reports PROVIDER_NOT_READY without rules', async () => {
    const { statsig } = createFakeStatsig({
      gates: { g: { value: false, ruleID: '', reason: 'Uninitialized' } },
    });
    await expect(
      resolve(new StatsigProvider(statsig), 'g', 'boolean'),
    ).rejects.toMatchObject({ code: ErrorCode.PROVIDER_NOT_READY });
  });

  it('throws an error which is tried again when Statsig fails to initialize', async () => {
    const { fake, statsig } = createFakeStatsig(entities);
    fake.initialize.mockResolvedValueOnce({
      isSuccess: false,
      error: 'NetworkError|RequestFailed: connect ECONNREFUSED',
    } as never);
    await expect(
      new StatsigProvider(statsig).initialize(),
    ).rejects.toMatchObject({ code: 'GENERAL' });
  });

  it.each([
    401, 403,
  ])('throws a fatal error, which is not tried again, for a key which Statsig rejects (%i)', async (status) => {
    const { fake, statsig } = createFakeStatsig(entities);
    // The message of @statsig/statsig-node-core for a wrong key
    fake.initialize.mockResolvedValueOnce({
      isSuccess: false,
      error: `NetworkError|RetriesExhausted: https://api.statsigcdn.com/v2/download_config_specs/secret-*****.json status(${status}) attempts(1) Unauthorized: Unauthorized`,
    } as never);
    await expect(
      new StatsigProvider(statsig).initialize(),
    ).rejects.toMatchObject({
      code: 'PROVIDER_FATAL',
      message: expect.stringContaining('Check the Statsig server secret key'),
    });
  });
});

function resolve(
  provider: StatsigProvider,
  key: string,
  type: 'boolean' | 'string' | 'number' | 'object',
) {
  if (type === 'boolean') {
    return provider.resolveBooleanEvaluation(key, false, context);
  }
  if (type === 'string') {
    return provider.resolveStringEvaluation(key, '', context);
  }
  if (type === 'number') {
    return provider.resolveNumberEvaluation(key, 0, context);
  }
  return provider.resolveObjectEvaluation(key, {}, context);
}

describe('StatsigProvider: evaluation context', () => {
  it('maps the context to a StatsigUser', async () => {
    const { statsig, calls } = createFakeStatsig(entities);
    const provider = new StatsigProvider(statsig);
    await provider.resolveBooleanEvaluation('show_banner', false, {
      targetingKey: 'user-1',
      email: 'a@example.com',
      ip: '1.2.3.4',
      userAgent: 'agent',
      country: 'AT',
      locale: 'de-AT',
      appVersion: '1.0.0',
      custom: { plan: 'pro' },
      customIDs: { stableID: 'stable-1' },
      privateAttributes: { secret: 'x' },
      statsigEnvironment: { tier: 'staging' },
      age: 30,
    });
    const user = calls[0]?.user as StatsigUser;
    expect(user.userID).toBe('user-1');
    expect(user.email).toBe('a@example.com');
    expect(user.ip).toBe('1.2.3.4');
    expect(user.userAgent).toBe('agent');
    expect(user.country).toBe('AT');
    expect(user.locale).toBe('de-AT');
    expect(user.appVersion).toBe('1.0.0');
    expect(user.custom).toEqual({ plan: 'pro', age: 30 });
    expect(user.customIDs).toEqual({ stableID: 'stable-1' });
    expect(user.privateAttributes).toEqual({ secret: 'x' });
    expect(user.statsigEnvironment).toEqual({ tier: 'staging' });
  });

  it('accepts the StatsigUser shape of the v4 adapter', () => {
    expect(
      toStatsigUserArgs({ userID: 'demo-user', custom: { a: [1, 2] } }),
    ).toEqual({ userID: 'demo-user', custom: { a: [1, 2] } });
  });

  it('prefers targetingKey over userID', () => {
    expect(toStatsigUserArgs({ targetingKey: 'a', userID: 'b' })).toEqual({
      userID: 'a',
    });
  });

  it('drops values which Statsig does not accept', () => {
    expect(
      toStatsigUserArgs({
        email: 5 as unknown as string,
        nested: { a: 1 },
        list: ['a', { b: 1 }],
        when: new Date('2026-01-01T00:00:00.000Z'),
        customIDs: { stableID: 's', bad: 1 },
      }),
    ).toEqual({
      customIDs: { stableID: 's' },
      custom: { when: '2026-01-01T00:00:00.000Z' },
    });
  });
});

describe('StatsigProvider: lifecycle and tracking', () => {
  it('initializes the instance', async () => {
    const { fake, statsig } = createFakeStatsig(entities);
    await new StatsigProvider(statsig).initialize();
    expect(fake.initialize).toHaveBeenCalledTimes(1);
  });

  it('does not shut down an instance which it did not create', async () => {
    const { fake, statsig } = createFakeStatsig(entities);
    await new StatsigProvider(statsig).onClose();
    expect(fake.shutdown).not.toHaveBeenCalled();
  });

  it('logs tracking events with logEvent', () => {
    const { fake, statsig } = createFakeStatsig(entities);
    const provider = new StatsigProvider(statsig);
    provider.track('purchase', context, {
      value: 42,
      currency: 'EUR',
      items: ['a'],
    });
    expect(fake.logEvent).toHaveBeenCalledTimes(1);
    const [user, name, value, metadata] = fake.logEvent.mock.calls[0] ?? [];
    expect((user as StatsigUser).userID).toBe('user-1');
    expect(name).toBe('purchase');
    expect(value).toBe(42);
    expect(metadata).toEqual({ currency: 'EUR', items: '["a"]' });
  });

  it('works with the OpenFeature SDK', async () => {
    const { statsig } = createFakeStatsig(entities);
    await OpenFeature.setProviderAndWait(new StatsigProvider(statsig));
    const client = OpenFeature.getClient();
    await expect(
      client.getStringValue('config:welcome.text', 'x', context),
    ).resolves.toBe('Hello');
    const details = await client.getNumberDetails('config:welcome.text', 0, {
      targetingKey: 'user-1',
    });
    expect(details.value).toBe(0);
    expect(details.errorCode).toBe(ErrorCode.TYPE_MISMATCH);
    await OpenFeature.close();
  });
});

describe('StatsigProvider: real Statsig module', () => {
  let provider: StatsigProvider | undefined;

  afterEach(async () => {
    await provider?.onClose();
    provider = undefined;
  });

  it('evaluates local overrides without network', async () => {
    provider = new StatsigProvider('secret-test-key', {
      statsigOptions: { disableNetwork: true, outputLogLevel: 'none' },
    });
    const { statsig } = provider;
    statsig.overrideGate('show_banner', true);
    statsig.overrideDynamicConfig('welcome', { text: 'Hello offline' });
    statsig.overrideExperiment('pricing', { price: 5 });
    statsig.overrideLayer('checkout', { color: 'green' });
    await provider.initialize();

    await expect(
      provider.resolveBooleanEvaluation('show_banner', false, context),
    ).resolves.toMatchObject({ value: true, reason: 'STATIC' });
    await expect(
      provider.resolveStringEvaluation('config:welcome.text', '', context),
    ).resolves.toMatchObject({ value: 'Hello offline' });
    await expect(
      provider.resolveNumberEvaluation('experiment:pricing.price', 0, context),
    ).resolves.toMatchObject({ value: 5 });
    await expect(
      provider.resolveStringEvaluation('layer:checkout.color', '', context),
    ).resolves.toMatchObject({ value: 'green' });
    // Without network, Statsig has no rules for other entities
    await expect(
      provider.resolveBooleanEvaluation('other_gate', false, context),
    ).rejects.toMatchObject({ code: ErrorCode.PROVIDER_NOT_READY });
  });
});
