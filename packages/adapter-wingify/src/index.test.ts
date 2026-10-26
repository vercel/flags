import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WINGIFY_FM_ORIGIN } from './constants';

const sdk = vi.hoisted(() => {
  const isEnabled = vi.fn();
  const getVariable = vi.fn();
  const getFlag = vi.fn();
  const init = vi.fn();

  return { isEnabled, getVariable, getFlag, init };
});

vi.mock('wingify-fme-node-sdk', () => ({
  init: sdk.init,
}));

const emptyRequest = {
  headers: new Headers(),
  cookies: {} as never,
};

async function loadAdapterModule() {
  return import('./index');
}

describe('createWingifyAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sdk.getFlag.mockResolvedValue({
      isEnabled: sdk.isEnabled,
      getVariable: sdk.getVariable,
    });
    sdk.init.mockResolvedValue({
      getFlag: sdk.getFlag,
    });
  });

  it('initializes the Wingify client with tracking waits enabled by default', async () => {
    const { createWingifyAdapter } = await loadAdapterModule();

    createWingifyAdapter({
      accountId: '12345',
      sdkKey: 'sdk-key',
      pollInterval: 60_000,
    });

    expect(sdk.init).toHaveBeenCalledWith({
      shouldWaitForTrackingCalls: true,
      accountId: '12345',
      sdkKey: 'sdk-key',
      pollInterval: 60_000,
    });
  });

  it('lets callers opt out of waiting for tracking calls', async () => {
    const { createWingifyAdapter } = await loadAdapterModule();

    createWingifyAdapter({
      accountId: '12345',
      sdkKey: 'sdk-key',
      shouldWaitForTrackingCalls: false,
    });

    expect(sdk.init).toHaveBeenCalledWith({
      shouldWaitForTrackingCalls: false,
      accountId: '12345',
      sdkKey: 'sdk-key',
    });
  });

  it('throws when entities.id is missing', async () => {
    const { createWingifyAdapter } = await loadAdapterModule();
    const adapter = createWingifyAdapter({
      accountId: '12345',
      sdkKey: 'sdk-key',
    }).variation();

    await expect(
      adapter.decide({
        key: 'checkout-v2',
        defaultValue: false,
        entities: undefined,
        ...emptyRequest,
      }),
    ).rejects.toThrow(
      `Wingify Adapter: 'entities.id' is required to evaluate flag "checkout-v2"`,
    );
    expect(sdk.getFlag).not.toHaveBeenCalled();
  });

  it('evaluates the boolean enabled state when no variableName is set', async () => {
    sdk.isEnabled.mockReturnValue(true);
    const { createWingifyAdapter } = await loadAdapterModule();
    const adapter = createWingifyAdapter({
      accountId: '12345',
      sdkKey: 'sdk-key',
    }).variation();

    await expect(
      adapter.decide({
        key: 'checkout-v2',
        defaultValue: false,
        entities: { id: 'user-1' },
        ...emptyRequest,
      }),
    ).resolves.toBe(true);

    expect(sdk.getFlag).toHaveBeenCalledWith('checkout-v2', { id: 'user-1' });
    expect(sdk.isEnabled).toHaveBeenCalledOnce();
    expect(sdk.getVariable).not.toHaveBeenCalled();
  });

  it('evaluates a feature variable when variableName is set', async () => {
    sdk.getVariable.mockReturnValue(30);
    const { createWingifyAdapter } = await loadAdapterModule();
    const adapter = createWingifyAdapter({
      accountId: '12345',
      sdkKey: 'sdk-key',
    }).variation({
      variableName: 'discount',
      defaultValue: 0,
    });

    await expect(
      adapter.decide({
        key: 'checkoutFlow:discount',
        defaultValue: 10,
        entities: { id: 'user-1', customVariables: { plan: 'pro' } },
        ...emptyRequest,
      }),
    ).resolves.toBe(30);

    expect(sdk.getFlag).toHaveBeenCalledWith('checkoutFlow:discount', {
      id: 'user-1',
      customVariables: { plan: 'pro' },
    });
    expect(sdk.getVariable).toHaveBeenCalledWith('discount', 0);
  });

  it('uses featureKey for getFlag when the Flags SDK key is a composite Explorer key', async () => {
    sdk.getVariable.mockReturnValue('buy now');
    const { createWingifyAdapter } = await loadAdapterModule();
    const adapter = createWingifyAdapter({
      accountId: '12345',
      sdkKey: 'sdk-key',
    }).variation({
      featureKey: 'checkoutFlow',
      variableName: 'cta',
      defaultValue: '',
    });

    await expect(
      adapter.decide({
        key: 'checkoutFlow:cta',
        defaultValue: '',
        entities: { id: 'user-1' },
        ...emptyRequest,
      }),
    ).resolves.toBe('buy now');

    expect(sdk.getFlag).toHaveBeenCalledWith('checkoutFlow', { id: 'user-1' });
    expect(sdk.getVariable).toHaveBeenCalledWith('cta', '');
  });

  it('falls back to the flag defaultValue when the adapter does not set one', async () => {
    sdk.getVariable.mockReturnValue('blue');
    const { createWingifyAdapter } = await loadAdapterModule();
    const adapter = createWingifyAdapter({
      accountId: '12345',
      sdkKey: 'sdk-key',
    }).variation({ variableName: 'color' });

    await adapter.decide({
      key: 'theme',
      defaultValue: 'red',
      entities: { id: 'user-1' },
      ...emptyRequest,
    });

    expect(sdk.getVariable).toHaveBeenCalledWith('color', 'red');
  });

  it('exposes a stable adapterId and the Wingify dashboard origin', async () => {
    const { createWingifyAdapter } = await loadAdapterModule();
    const created = createWingifyAdapter({
      accountId: '12345',
      sdkKey: 'sdk-key',
    });
    const first = created.variation();
    const second = created.variation({ variableName: 'cta' });

    expect(first.adapterId).toBe('wingify:sdk-key');
    expect(second.adapterId).toBe('wingify:sdk-key');

    const origin =
      typeof first.origin === 'function'
        ? first.origin('checkout-v2')
        : first.origin;
    expect(origin).toBe(WINGIFY_FM_ORIGIN);
  });
});

describe('wingifyAdapter default singleton', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    sdk.init.mockResolvedValue({
      getFlag: sdk.getFlag,
    });
  });

  it('throws when environment credentials are missing', async () => {
    delete process.env.WINGIFY_ACCOUNT_ID;
    delete process.env.WINGIFY_SDK_KEY;
    const { wingifyAdapter } = await loadAdapterModule();

    expect(() => wingifyAdapter.variation()).toThrow(
      /Missing WINGIFY_ACCOUNT_ID or WINGIFY_SDK_KEY/,
    );
  });

  it('creates the default adapter from environment variables on first use', async () => {
    process.env.WINGIFY_ACCOUNT_ID = 'env-account';
    process.env.WINGIFY_SDK_KEY = 'env-sdk-key';
    const { wingifyAdapter } = await loadAdapterModule();

    wingifyAdapter.variation();
    await wingifyAdapter.wingifyClient;

    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.init).toHaveBeenCalledWith({
      shouldWaitForTrackingCalls: true,
      accountId: 'env-account',
      sdkKey: 'env-sdk-key',
    });
  });
});
