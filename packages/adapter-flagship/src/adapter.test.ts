import type { Mock } from 'vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  BucketingDTO,
  IHit,
  NewVisitor,
  Visitor,
  HitType,
} from '@flagship.io/js-sdk';
import { DecisionMode, Flagship } from '@flagship.io/js-sdk';
import type { ReadonlyHeaders, ReadonlyRequestCookies } from 'flags';
import {
  createFlagshipAdapter,
  ERROR_EDGE_CONFIG_REQUIRED,
  ERROR_FLAGSHIP_ENV_API_KEY_REQUIRED,
  flagshipAdapter,
} from './adapter';
import * as bucketing from './helpers/bucketing';

// Mock dependencies
vi.mock('@flagship.io/js-sdk', () => {
  const mockVisitor = {
    fetchFlags: vi.fn().mockResolvedValue(undefined),
    getFlag: vi.fn().mockReturnValue({
      getValue: vi.fn(<T>(defaultValue: T): T => defaultValue),
    }),
  };

  return {
    DecisionMode: {
      BUCKETING_EDGE: 'BUCKETING_EDGE',
    },
    FSSdkStatus: {
      SDK_NOT_INITIALIZED: 0,
      SDK_READY: 'READY',
    },
    LogLevel: {
      INFO: 7,
    },
    Flagship: {
      getVisitor: () => mockVisitor,
      getStatus: vi.fn().mockReturnValue(0),
      start: vi.fn().mockResolvedValue(undefined),
      newVisitor: vi.fn().mockReturnValue(mockVisitor),
      close: vi.fn().mockResolvedValue(undefined),
    },
  };
});

describe('createFlagshipAdapter', () => {
  const mockEnvId = 'test-env-id';
  const mockApiKey = 'test-api-key';

  const fetchInitialBucketingData = vi.spyOn(
    bucketing,
    'fetchInitialBucketingData',
  );

  afterEach(() => {
    fetchInitialBucketingData.mockClear();
    (Flagship.start as Mock).mockClear();
    (Flagship.getVisitor()?.fetchFlags as Mock).mockClear();
  });

  it('should throw an error if envId or apiKey is missing', () => {
    expect(() => createFlagshipAdapter({ envId: '', apiKey: '' })).toThrow(
      'Flagship envID and apiKey are required',
    );
    expect(() =>
      createFlagshipAdapter({ envId: mockEnvId, apiKey: '' }),
    ).toThrow('Flagship envID and apiKey are required');
    expect(() =>
      createFlagshipAdapter({ envId: '', apiKey: mockApiKey }),
    ).toThrow('Flagship envID and apiKey are required');
    expect(() =>
      createFlagshipAdapter({ envId: mockEnvId, apiKey: mockApiKey }),
    ).not.toThrow();
  });

  it('should create an adapter with origin method that returns the correct URL', () => {
    const { getFlag } = createFlagshipAdapter({
      envId: mockEnvId,
      apiKey: mockApiKey,
    });

    const adapter = getFlag();
    expect(typeof adapter.origin === 'function' && adapter.origin('key')).toBe(
      `https://app.flagship.io/env/${mockEnvId}/dashboard`,
    );
  });

  it('should initialize Flagship SDK when decide is called', async () => {
    const { getFlag } = createFlagshipAdapter({
      envId: mockEnvId,
      apiKey: mockApiKey,
    });
    const entities: NewVisitor = {
      visitorId: 'visitor-123',
      context: {
        key: 'value',
      },
      hasConsented: true,
    };
    const adapter = getFlag<boolean, NewVisitor>();

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
    expect(Flagship.start).toHaveBeenCalledWith(mockEnvId, mockApiKey, {
      fetchNow: false,
    });
    // eslint-disable-next-line jest/unbound-method -- This is a mocked method in tests, so there's no risk of 'this' binding issues
    expect(Flagship.newVisitor).toHaveBeenCalledWith(entities);
    // eslint-disable-next-line jest/unbound-method -- This is a mocked method in tests, so there's no risk of 'this' binding issues
    expect(Flagship.newVisitor).toHaveBeenCalledTimes(1);

    // eslint-disable-next-line jest/unbound-method -- This is a mocked method in tests, so there's no risk of 'this' binding issues
    expect(Flagship.getVisitor()?.fetchFlags).toHaveBeenCalledTimes(1);
  });

  it('should fetch initial bucketing data when using BUCKETING_EDGE mode', async () => {
    const initialBucketing = { campaigns: [] };
    fetchInitialBucketingData.mockResolvedValue(initialBucketing);
    const { getFlag } = createFlagshipAdapter({
      envId: mockEnvId,
      apiKey: mockApiKey,
      config: {
        decisionMode: DecisionMode.BUCKETING_EDGE,
      },
    });

    const adapter = getFlag<boolean, { userId: string }>();

    await adapter.decide({
      key: 'test-flag',
      defaultValue: false,
      headers: {} as ReadonlyHeaders,
      cookies: {} as ReadonlyRequestCookies,
    });

    expect(fetchInitialBucketingData).toHaveBeenCalledOnce();
    // eslint-disable-next-line jest/unbound-method -- This is a mocked method in tests, so there's no risk of 'this' binding issues
    expect(Flagship.start).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line jest/unbound-method -- This is a mocked method in tests, so there's no risk of 'this' binding issues
    expect(Flagship.start).toHaveBeenCalledWith(
      mockEnvId,
      mockApiKey,
      expect.objectContaining({
        decisionMode: DecisionMode.BUCKETING_EDGE,
        initialBucketing,
        fetchNow: false,
      }),
    );
  });

  it('should use initial bucketing data when using BUCKETING_EDGE mode', async () => {
    const initialBucketing = { campaigns: [] };
    fetchInitialBucketingData.mockResolvedValue({} as BucketingDTO);
    const { getFlag } = createFlagshipAdapter({
      envId: mockEnvId,
      apiKey: mockApiKey,
      config: {
        decisionMode: DecisionMode.BUCKETING_EDGE,
        initialBucketing,
      },
    });

    const adapter = getFlag<boolean, { userId: string }>();

    await adapter.decide({
      key: 'test-flag',
      defaultValue: false,
      headers: {} as ReadonlyHeaders,
      cookies: {} as ReadonlyRequestCookies,
    });

    expect(fetchInitialBucketingData).not.toHaveBeenCalled();
    // eslint-disable-next-line jest/unbound-method -- This is a mocked method in tests, so there's no risk of 'this' binding issues
    expect(Flagship.start).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line jest/unbound-method -- This is a mocked method in tests, so there's no risk of 'this' binding issues
    expect(Flagship.start).toHaveBeenCalledWith(
      mockEnvId,
      mockApiKey,
      expect.objectContaining({
        decisionMode: DecisionMode.BUCKETING_EDGE,
        initialBucketing,
        fetchNow: false,
      }),
    );
  });

  it('should throw an error when decide is called with an invalid key', async () => {
    const { getFlag } = createFlagshipAdapter({
      envId: mockEnvId,
      apiKey: mockApiKey,
    });

    const adapter = getFlag<boolean, { userId: string }>();

    await expect(
      adapter.decide({
        key: '',
        defaultValue: false,
        headers: {} as ReadonlyHeaders,
        cookies: {} as ReadonlyRequestCookies,
      }),
    ).rejects.toThrow('Flagship key is required');

    await expect(
      adapter.decide({
        key: undefined as unknown as string,
        defaultValue: false,
        headers: {} as ReadonlyHeaders,
        cookies: {} as ReadonlyRequestCookies,
      }),
    ).rejects.toThrow('Flagship key is required');
  });

  it('should initialize visitor with entities and return flag value', async () => {
    const { getFlag } = createFlagshipAdapter({
      envId: mockEnvId,
      apiKey: mockApiKey,
    });

    const mockVisitor = Flagship.getVisitor();
    // eslint-disable-next-line jest/unbound-method -- This is a mocked method in tests, so there's no risk of 'this' binding issues
    const getFlagMock = mockVisitor?.getFlag as Mock;
    getFlagMock.mockClear();
    const flagValue = 'flag-value';
    const getValue = vi.fn().mockReturnValue(flagValue);
    getFlagMock.mockReturnValue({
      getValue,
    });

    const entities: NewVisitor = {
      visitorId: 'visitor-123',
      context: {
        key: 'value',
      },
      hasConsented: true,
    };

    const adapter = getFlag<string, NewVisitor>();

    const defaultValue = 'default-value';
    const result = await adapter.decide({
      key: 'test-flag',
      entities,
      defaultValue,
      headers: {} as ReadonlyHeaders,
      cookies: {} as ReadonlyRequestCookies,
    });

    expect(flagValue).toBe(result);
    expect(getFlagMock).toHaveBeenCalledTimes(1);
    expect(getFlagMock).toHaveBeenNthCalledWith(1, 'test-flag');
    expect(getValue).toHaveBeenCalledTimes(1);
    expect(getValue).toHaveBeenNthCalledWith(1, defaultValue, true);
    // eslint-disable-next-line jest/unbound-method -- This is a mocked method in tests, so there's no risk of 'this' binding issues
    expect(mockVisitor?.fetchFlags).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line jest/unbound-method -- This is a mocked method in tests, so there's no risk of 'this' binding issues
    expect(Flagship.newVisitor).toHaveBeenCalledWith(entities);

    const adapter2 = getFlag<string, NewVisitor>(false);

    const defaultValue2 = 'default-value2';
    const result2 = await adapter2.decide({
      key: 'test-flag',
      entities,
      defaultValue: defaultValue2,
      headers: {} as ReadonlyHeaders,
      cookies: {} as ReadonlyRequestCookies,
    });
    expect(result2).toBe(result);
    expect(getFlagMock).toHaveBeenNthCalledWith(1, 'test-flag');
    expect(getValue).toHaveBeenNthCalledWith(2, defaultValue2, false);
  });

  it('should initialize Flagship SDK in Bucketing mode', async () => {
    const { getFlag } = createFlagshipAdapter({
      envId: mockEnvId,
      apiKey: mockApiKey,
      config: {
        decisionMode: DecisionMode.BUCKETING,
      },
    });

    const adapter = getFlag<boolean, NewVisitor>();

    await adapter.decide({
      key: 'test-flag',
      defaultValue: false,
      headers: {} as ReadonlyHeaders,
      cookies: {} as ReadonlyRequestCookies,
    });

    // eslint-disable-next-line jest/unbound-method -- This is a mocked method in tests, so there's no risk of 'this' binding issues
    expect(Flagship.start).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line jest/unbound-method -- This is a mocked method in tests, so there's no risk of 'this' binding issues
    expect(Flagship.start).toHaveBeenCalledWith(mockEnvId, mockApiKey, {
      decisionMode: DecisionMode.BUCKETING,
      fetchNow: false,
    });
  });
});

describe('flagshipAdapter', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should throw an error when environment variables are missing', () => {
    process.env.FLAGSHIP_ENV_ID = '';
    process.env.FLAGSHIP_API_KEY = '';

    expect(() => flagshipAdapter.getFlag()).toThrow(
      ERROR_FLAGSHIP_ENV_API_KEY_REQUIRED,
    );
  });

  it('should throw an error when edge mode is enabled but required variables are missing', () => {
    process.env.FLAGSHIP_ENV_ID = 'env-from-env';
    process.env.FLAGSHIP_API_KEY = 'key-from-env';
    process.env.EDGE_CONFIG = '';
    process.env.EDGE_CONFIG_ITEM_KEY = '';
    process.env.FLAGSHIP_DECISION_MODE = '2';

    expect(() => flagshipAdapter.getFlag()).toThrow(ERROR_EDGE_CONFIG_REQUIRED);
  });

  it('should create an adapter with environment variables', () => {
    process.env.FLAGSHIP_ENV_ID = 'env-from-env';
    process.env.FLAGSHIP_API_KEY = 'key-from-env';

    const adapter = flagshipAdapter.getFlag<boolean, NewVisitor>();
    expect(adapter).toBeDefined();
    expect(typeof adapter.origin === 'function' && adapter.origin('key')).toBe(
      `https://app.flagship.io/env/${process.env.FLAGSHIP_ENV_ID}/dashboard`,
    );
  });

  it('should configure edge mode when all required variables are present', () => {
    process.env.FLAGSHIP_ENV_ID = 'env-from-env';
    process.env.FLAGSHIP_API_KEY = 'key-from-env';
    process.env.EDGE_CONFIG = 'edge-config-string';
    process.env.EDGE_CONFIG_ITEM_KEY = 'edge-config-key';
    process.env.FLAGSHIP_DECISION_MODE = '2';

    const adapter = flagshipAdapter.getFlag<boolean, NewVisitor>(true);
    expect(adapter).toBeDefined();
  });

  it('should configure bucketing mode when decision mode is set to BUCKETING', () => {
    process.env.FLAGSHIP_ENV_ID = 'env-from-env';
    process.env.FLAGSHIP_API_KEY = 'key-from-env';
    process.env.FLAGSHIP_DECISION_MODE = '1';

    const adapter = flagshipAdapter.getFlag<boolean, NewVisitor>();
    expect(adapter).toBeDefined();
  });
});

describe('createFlagshipAdapter additional methods', () => {
  const mockEnvId = 'test-env-id';
  const mockApiKey = 'test-api-key';

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should call Flagship.close when close method is called', async () => {
    vi.spyOn(Flagship, 'close').mockResolvedValue(undefined);

    const adapter = createFlagshipAdapter({
      envId: mockEnvId,
      apiKey: mockApiKey,
    });

    await adapter.close();
    // eslint-disable-next-line jest/unbound-method -- This is a mocked method in tests, so there's no risk of 'this' binding issues
    expect(Flagship.close).toHaveBeenCalledTimes(1);
  });

  it('should fetch and return all flags for a visitor', async () => {
    const mockFlagsCollection = { flag1: {}, flag2: {} };
    const mockGetFlags = vi.fn().mockReturnValue(mockFlagsCollection);
    const mockNewVisitor = {
      fetchFlags: vi.fn().mockResolvedValue(undefined),
      getFlags: mockGetFlags,
    } as unknown as Visitor;

    vi.spyOn(Flagship, 'newVisitor').mockReturnValue(mockNewVisitor);

    vi.spyOn(Flagship, 'getStatus').mockReturnValue(0);

    const adapter = createFlagshipAdapter({
      envId: mockEnvId,
      apiKey: mockApiKey,
    });

    const entities = {
      visitorId: 'visitor-456',
      context: { test: 'value' },
      hasConsented: true,
    };

    const result = await adapter.getAllFlags(entities);
    // eslint-disable-next-line jest/unbound-method -- This is a mocked method in tests, so there's no risk of 'this' binding issues
    expect(Flagship.newVisitor).toHaveBeenCalledWith(entities);
    // eslint-disable-next-line jest/unbound-method -- This is a mocked method in tests, so there's no risk of 'this' binding issues
    expect(mockNewVisitor.fetchFlags).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line jest/unbound-method -- This is a mocked method in tests, so there's no risk of 'this' binding issues
    expect(mockNewVisitor.getFlags).toHaveBeenCalledTimes(1);
    expect(result).toBe(mockFlagsCollection);
  });

  it('should send hits for a visitor', async () => {
    const mockSendHits = vi.fn().mockResolvedValue(undefined);
    const mockNewVisitor = {
      sendHits: mockSendHits,
    } as unknown as Visitor;

    vi.spyOn(Flagship, 'getStatus').mockReturnValue(0);

    vi.spyOn(Flagship, 'newVisitor').mockReturnValue(mockNewVisitor);

    const adapter = createFlagshipAdapter({
      envId: mockEnvId,
      apiKey: mockApiKey,
    });

    const entities = {
      visitorId: 'visitor-202',
      context: { page: 'product' },
      hasConsented: true,
    };

    const hits: IHit[] = [
      {
        type: 'PAGEVIEW' as HitType.PAGE,
        documentLocation: 'https://example.com/product',
      },
      {
        type: 'PAGEVIEW' as HitType.PAGE,
        documentLocation: 'https://example.com/product-2',
      },
    ];

    await adapter.sendHits(entities, hits);

    // eslint-disable-next-line jest/unbound-method -- This is a mocked method in tests, so there's no risk of 'this' binding issues
    expect(Flagship.start).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line jest/unbound-method -- This is a mocked method in tests, so there's no risk of 'this' binding issues
    expect(Flagship.start).toHaveBeenCalledWith(mockEnvId, mockApiKey, {
      fetchNow: false,
    });
    // eslint-disable-next-line jest/unbound-method -- This is a mocked method in tests, so there's no risk of 'this' binding issues
    expect(Flagship.newVisitor).toHaveBeenCalledWith(entities);
    expect(mockSendHits).toHaveBeenCalledTimes(1);
    expect(mockSendHits).toHaveBeenCalledWith(hits);
  });
});

describe('flagshipAdapter additional methods', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv };
    process.env.FLAGSHIP_ENV_ID = 'env-from-env';
    process.env.FLAGSHIP_API_KEY = 'key-from-env';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should provide access to getAllFlags method', async () => {
    const mockGetFlags = vi.fn().mockReturnValue({ flag1: {}, flag2: {} });
    const mockNewVisitor = {
      fetchFlags: vi.fn().mockResolvedValue(undefined),
      getFlags: mockGetFlags,
    } as unknown as Visitor;

    vi.spyOn(Flagship, 'newVisitor').mockReturnValue(mockNewVisitor);

    const entities = {
      visitorId: 'visitor-303',
      context: { test: 'context' },
      hasConsented: true,
    };

    await flagshipAdapter.getAllFlags(entities);
    // eslint-disable-next-line jest/unbound-method -- This is a mocked method in tests, so there's no risk of 'this' binding issues
    expect(Flagship.newVisitor).toHaveBeenCalledWith(entities);
    // eslint-disable-next-line jest/unbound-method -- This is a mocked method in tests, so there's no risk of 'this' binding issues
    expect(mockNewVisitor.getFlags).toHaveBeenCalledTimes(1);
  });

  it('should provide access to close method', async () => {
    vi.spyOn(Flagship, 'close').mockResolvedValue(undefined);

    await flagshipAdapter.close();
    // eslint-disable-next-line jest/unbound-method -- This is a mocked method in tests, so there's no risk of 'this' binding issues
    expect(Flagship.close).toHaveBeenCalledTimes(1);
  });

  it('should provide access to sendHits method', async () => {
    const mockSendHits = vi.fn().mockResolvedValue(undefined);
    const mockNewVisitor = {
      sendHits: mockSendHits,
    } as unknown as Visitor;

    vi.spyOn(Flagship, 'newVisitor').mockReturnValue(mockNewVisitor);

    const entities = {
      visitorId: 'visitor-404',
      context: { page: 'checkout' },
      hasConsented: true,
    };

    const hits: IHit[] = [
      {
        type: 'PAGEVIEW' as HitType.PAGE,
        documentLocation: 'https://example.com/product',
      },
      {
        type: 'PAGEVIEW' as HitType.PAGE,
        documentLocation: 'https://example.com/product-2',
      },
    ];

    await flagshipAdapter.sendHits(entities, hits);

    // eslint-disable-next-line jest/unbound-method -- This is a mocked method in tests, so there's no risk of 'this' binding issues
    expect(Flagship.newVisitor).toHaveBeenCalledWith(entities);
    expect(mockSendHits).toHaveBeenCalledWith(hits);
  });
});
