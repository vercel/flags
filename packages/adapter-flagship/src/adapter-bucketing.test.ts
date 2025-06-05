import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DecisionMode, Flagship, LogLevel } from '@flagship.io/js-sdk';
import type { NewVisitor, Visitor } from '@flagship.io/js-sdk';
import type { ReadonlyHeaders, ReadonlyRequestCookies } from 'flags';
import { flagshipAdapter } from './adapter';

describe('flagshipAdapter', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should configure bucketing mode when decision mode is set to BUCKETING', async () => {
    process.env.FLAGSHIP_ENV_ID = 'env-from-env';
    process.env.FLAGSHIP_API_KEY = 'key-from-env';
    process.env.FLAGSHIP_DECISION_MODE = '1';
    process.env.FLAGSHIP_LOG_LEVEL = '8';

    const mockNewVisitor = {
      fetchFlags: vi.fn().mockResolvedValue(undefined),
      getFlag: vi.fn().mockReturnValue({
        getValue: vi.fn(<T>(defaultValue: T): T => defaultValue),
      }),
    } as unknown as Visitor;

    vi.spyOn(Flagship, 'newVisitor').mockReturnValue(mockNewVisitor);
    vi.spyOn(Flagship, 'getStatus').mockReturnValue(0);
    vi.spyOn(Flagship, 'start').mockResolvedValue({} as unknown as Flagship);

    const adapter = flagshipAdapter.getFlag<boolean, NewVisitor>();
    expect(adapter).toBeDefined();

    const entities: NewVisitor = {
      visitorId: 'visitor-123',
      context: {
        key: 'value',
      },
      hasConsented: true,
    };

    await adapter.decide({
      key: 'test-flag',
      defaultValue: false,
      entities,
      headers: {} as ReadonlyHeaders,
      cookies: {} as ReadonlyRequestCookies,
    });

    // eslint-disable-next-line jest/unbound-method -- This is a mocked method in tests, so there's no risk of 'this' binding issues
    expect(Flagship.start).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line jest/unbound-method -- This is a mocked method in tests, so there's no risk of 'this' binding issues
    expect(Flagship.start).toHaveBeenCalledWith(
      process.env.FLAGSHIP_ENV_ID,
      process.env.FLAGSHIP_API_KEY,
      {
        fetchNow: false,
        decisionMode: DecisionMode.BUCKETING,
        logLevel: LogLevel.DEBUG,
        connectionString: undefined,
        edgeConfigItemKey: undefined,
      },
    );
  });
});
