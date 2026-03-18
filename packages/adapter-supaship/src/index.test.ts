import type { ReadonlyRequestCookies } from 'flags';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSupashipAdapter,
  resetDefaultSupashipAdapter,
  supashipAdapter,
} from '.';

const getFeatureMock = vi.fn();
const supaClientConstructorMock = vi.fn();

vi.mock('@supashiphq/javascript-sdk', () => {
  class MockSupaClient {
    constructor(config: unknown) {
      supaClientConstructorMock(config);
    }

    getFeature = getFeatureMock;
  }

  return {
    SupaClient: MockSupaClient,
  };
});

describe('@flags-sdk/supaship', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDefaultSupashipAdapter();
    delete process.env.SUPASHIP_SDK_KEY;
    delete process.env.SUPASHIP_ENVIRONMENT;
  });

  it('creates a client with expected defaults', async () => {
    getFeatureMock.mockResolvedValueOnce(true);
    const adapter = createSupashipAdapter({
      sdkKey: 'test-sdk-key',
      environment: 'test',
    });

    await adapter.feature().decide({
      key: 'my-flag',
      headers: new Headers(),
      cookies: {} as ReadonlyRequestCookies,
      defaultValue: false,
    });

    expect(supaClientConstructorMock).toHaveBeenCalledWith({
      sdkKey: 'test-sdk-key',
      environment: 'test',
      context: {},
      features: {},
      sensitiveContextProperties: undefined,
      networkConfig: undefined,
      plugins: undefined,
      toolbar: false,
    });
  });

  it('merges adapter context and entities for each decision', async () => {
    getFeatureMock.mockResolvedValueOnce(true);
    const adapter = createSupashipAdapter({
      sdkKey: 'test-sdk-key',
      environment: 'test',
      context: { app: 'flags' },
    });

    const result = await adapter
      .feature({
        context: { region: 'us' },
      })
      .decide({
        key: 'my-flag',
        entities: { userId: '123' },
        headers: new Headers(),
        cookies: {} as ReadonlyRequestCookies,
      });

    expect(result).toBe(true);
    expect(getFeatureMock).toHaveBeenCalledWith('my-flag', {
      context: { app: 'flags', region: 'us', userId: '123' },
    });
  });

  it('uses defaultValue when Supaship returns undefined', async () => {
    getFeatureMock.mockResolvedValueOnce(undefined);
    const adapter = createSupashipAdapter({
      sdkKey: 'test-sdk-key',
      environment: 'test',
    });

    const result = await adapter.feature().decide({
      key: 'missing-flag',
      headers: new Headers(),
      cookies: {} as ReadonlyRequestCookies,
      defaultValue: false,
    });

    expect(result).toBe(false);
  });

  it('uses defaultValue when Supaship returns null', async () => {
    getFeatureMock.mockResolvedValueOnce(null);
    const adapter = createSupashipAdapter({
      sdkKey: 'test-sdk-key',
      environment: 'test',
    });

    const result = await adapter.feature().decide({
      key: 'null-flag',
      headers: new Headers(),
      cookies: {} as ReadonlyRequestCookies,
      defaultValue: false,
    });

    expect(result).toBe(false);
  });

  it('throws when Supaship returns undefined and no default exists', async () => {
    getFeatureMock.mockResolvedValueOnce(undefined);
    const adapter = createSupashipAdapter({
      sdkKey: 'test-sdk-key',
      environment: 'test',
    });

    await expect(
      adapter.feature().decide({
        key: 'missing-flag',
        headers: new Headers(),
        cookies: {} as ReadonlyRequestCookies,
      }),
    ).rejects.toThrow(
      '@flags-sdk/supaship: Feature "missing-flag" resolved to null/undefined and no defaultValue was provided.',
    );
  });

  it('default adapter throws when required env vars are missing', () => {
    expect(() => supashipAdapter.feature()).toThrow(
      '@flags-sdk/supaship: Missing SUPASHIP_SDK_KEY environment variable',
    );
  });

  it('default adapter is lazily initialized once', async () => {
    process.env.SUPASHIP_SDK_KEY = 'sdk-key';
    process.env.SUPASHIP_ENVIRONMENT = 'production';

    getFeatureMock.mockResolvedValue(true);

    await supashipAdapter.feature().decide({
      key: 'flag-a',
      headers: new Headers(),
      cookies: {} as ReadonlyRequestCookies,
      defaultValue: false,
    });

    await supashipAdapter.feature().decide({
      key: 'flag-b',
      headers: new Headers(),
      cookies: {} as ReadonlyRequestCookies,
      defaultValue: false,
    });

    expect(supaClientConstructorMock).toHaveBeenCalledTimes(1);
  });
});
