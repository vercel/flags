import {
  describe,
  it,
  expect,
  vi,
  afterAll,
  beforeEach,
  afterEach,
} from 'vitest';
import { Flagship } from '@flagship.io/js-sdk';
import type { BucketingDTO } from '@flagship.io/js-sdk';
import type { AdapterConfig } from '../types';
import { fetchInitialBucketingData, getProviderData } from './bucketing';
import * as utils from './utils';

const logErrorSpy = vi.spyOn(utils, 'logError');
logErrorSpy.mockReturnValue(undefined);

describe('fetchInitialBucketingData', () => {
  const mockConfig = {
    connectionString: 'https://example.com/edge-config?token=abc123',
    edgeConfigItemKey: 'test-key',
  };

  const mockBucketingData: BucketingDTO = {
    campaigns: [
      {
        id: 'campaign-id',
        name: 'Test Campaign',
        type: 'AB',
        variationGroups: [],
      },
    ],
  };

  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;
  const mockFetch = vi.fn();

  const expectedEdgeConfigUrl =
    'https://example.com/edge-config/item/test-key?token=abc123';

  beforeEach(() => {
    global.fetch = mockFetch;
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('should fetch initial bucketing data successfully', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockBucketingData),
    });

    const result = await fetchInitialBucketingData(mockConfig);

    expect(mockFetch).toHaveBeenCalledWith(expectedEdgeConfigUrl);
    expect(result).toEqual(mockBucketingData);
  });

  it('should use environment variables when config is not provided', async () => {
    process.env.EDGE_CONFIG =
      'https://env-example.com/edge-config?token=env123';
    process.env.EDGE_CONFIG_ITEM_KEY = 'env-key';
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockBucketingData),
    });

    const result = await fetchInitialBucketingData({});

    expect(mockFetch).toHaveBeenCalledWith(
      'https://env-example.com/edge-config/item/env-key?token=env123',
    );
    expect(result).toEqual(mockBucketingData);
  });

  it('should prioritize config over environment variables ', async () => {
    process.env.EDGE_CONFIG =
      'https://env-example.com/edge-config?token=env123';
    process.env.EDGE_CONFIG_ITEM_KEY = 'env-key';
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockBucketingData),
    });

    const result = await fetchInitialBucketingData(mockConfig);

    expect(mockFetch).toHaveBeenCalledWith(expectedEdgeConfigUrl);
    expect(result).toEqual(mockBucketingData);
  });

  it('should throw error when connectionString is missing', async () => {
    const invalidConfig = {
      edgeConfigItemKey: 'test-key',
    } as AdapterConfig;

    const result = await fetchInitialBucketingData(invalidConfig);

    expect(result).toBeUndefined();
    expect(logErrorSpy).toHaveBeenCalledWith(
      Flagship.getConfig(),
      'Flagship connectionString is required for BUCKETING_EDGE mode',
      'fetchInitialBucketingData',
    );
  });

  it('should throw error when edgeConfigItemKey is missing', async () => {
    const invalidConfig = {
      connectionString: 'https://example.com/edge-config?token=abc123',
    } as AdapterConfig;

    const result = await fetchInitialBucketingData(invalidConfig);

    expect(result).toBeUndefined();
    expect(logErrorSpy).toHaveBeenCalledWith(
      Flagship.getConfig(),
      'Flagship edgeConfigItemKey is required for BUCKETING_EDGE mode',
      'fetchInitialBucketingData',
    );
  });

  it('should throw error when connectionString is invalid', async () => {
    const invalidConfig = {
      connectionString: 'invalid-url',
      edgeConfigItemKey: 'test-key',
    };

    const result = await fetchInitialBucketingData(invalidConfig);

    expect(result).toBeUndefined();
    expect(logErrorSpy).toHaveBeenCalledWith(
      Flagship.getConfig(),
      'Invalid Flagship connectionString: invalid-url',
      'fetchInitialBucketingData',
    );
  });

  it('should throw error when connectionString has no token', async () => {
    const invalidConfig = {
      connectionString: 'https://example.com/edge-config',
      edgeConfigItemKey: 'test-key',
    };

    const result = await fetchInitialBucketingData(invalidConfig);

    expect(result).toBeUndefined();
    expect(logErrorSpy).toHaveBeenCalledWith(
      Flagship.getConfig(),
      'Flagship connectionString must contain a token query parameter',
      'fetchInitialBucketingData',
    );
  });

  it('should handle non-OK fetch response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const result = await fetchInitialBucketingData(mockConfig);

    expect(result).toBeUndefined();
    expect(logErrorSpy).toHaveBeenCalledWith(
      Flagship.getConfig(),
      'Failed to fetch initial bucketing: 404 Not Found',
      'fetchInitialBucketingData',
    );
  });

  it('should handle fetch errors', async () => {
    const networkError = new Error('Network error');
    mockFetch.mockRejectedValue(networkError);

    const result = await fetchInitialBucketingData(mockConfig);

    expect(result).toBeUndefined();
    expect(logErrorSpy).toHaveBeenCalledWith(
      Flagship.getConfig(),
      'Network error',
      'fetchInitialBucketingData',
    );
  });

  it('should handle JSON parsing errors', async () => {
    const jsonError = new Error('Invalid JSON');
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.reject(jsonError),
    });

    const result = await fetchInitialBucketingData(mockConfig);

    expect(result).toBeUndefined();
    expect(logErrorSpy).toHaveBeenCalledWith(
      Flagship.getConfig(),
      'Invalid JSON',
      'fetchInitialBucketingData',
    );
  });

  it('should handle non-Error objects in catch block', async () => {
    mockFetch.mockRejectedValue('string error');

    const result = await fetchInitialBucketingData(mockConfig);

    expect(result).toBeUndefined();
    expect(logErrorSpy).toHaveBeenCalledWith(
      Flagship.getConfig(),
      'Unknown error fetching initial bucketing',
      'fetchInitialBucketingData',
    );
  });
});

describe('getProviderData', () => {
  const mockEnvId = 'test-env-id';
  const accessPoint = `https://cdn.flagship.io/${mockEnvId}/bucketing.json`;

  const originalFetch = global.fetch;
  const mockFetch = vi.fn();

  beforeEach(() => {
    global.fetch = mockFetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  const mockCampaign = {
    id: 'campaign-id',
    name: 'Test Campaign',
    type: 'AB',
    variationGroups: [
      {
        id: 'variation-group-id',
        targeting: {
          targetingGroups: [
            {
              targetings: [
                {
                  operator: 'equals',
                  key: 'testFlag',
                  value: true,
                },
              ],
            },
          ],
        },
        variations: [
          {
            id: 'variation-id',
            modifications: {
              type: 'flag',
              value: {
                testFlag: true,
                anotherFlag: 'test-value',
              },
            },
          },
        ],
      },
      {
        id: 'variation-group-id-2',
        targeting: {
          targetingGroups: [
            {
              targetings: [
                {
                  operator: 'equals',
                  key: 'testFlag',
                  value: false,
                },
              ],
            },
          ],
        },
        variations: [
          {
            id: 'variation-id',
            modifications: {
              type: 'flag',
              value: {
                testFlag: false,
                anotherFlag: 'test-value-2',
              },
            },
          },
        ],
      },
    ],
  };

  const mockBucketingData: BucketingDTO = {
    campaigns: [mockCampaign],
  };

  it('should fetch and transform provider data successfully', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockBucketingData),
    });

    const result = await getProviderData(mockEnvId);

    expect(mockFetch).toHaveBeenCalledOnce();

    expect(mockFetch).toHaveBeenCalledWith(accessPoint);
    expect(result).toEqual({
      definitions: {
        testFlag: {
          options: [{ value: true }, { value: false }],
          origin: `https://app.flagship.io/env/${mockEnvId}/report/ab/campaign-id/details`,
          description: 'Campaign: Test Campaign',
        },
        anotherFlag: {
          options: [{ value: 'test-value' }, { value: 'test-value-2' }],
          origin: `https://app.flagship.io/env/${mockEnvId}/report/ab/campaign-id/details`,
          description: 'Campaign: Test Campaign',
        },
      },
      hints: [],
    });
  });

  it('should handle non-OK fetch response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const result = await getProviderData(mockEnvId);

    expect(mockFetch).toHaveBeenCalledWith(accessPoint);
    expect(logErrorSpy).toHaveBeenCalledWith(
      Flagship.getConfig(),
      'Failed to fetch provider data: 404 Not Found',
      'getProviderData',
    );
    expect(result).toEqual({
      definitions: {},
      hints: [],
    });
  });

  it('should handle fetch errors', async () => {
    const networkError = new Error('Network error');
    mockFetch.mockRejectedValue(networkError);

    const result = await getProviderData(mockEnvId);

    expect(mockFetch).toHaveBeenCalledWith(accessPoint);
    expect(logErrorSpy).toHaveBeenCalledWith(
      Flagship.getConfig(),
      'Network error',
      'getProviderData',
    );
    expect(result).toEqual({
      definitions: {},
      hints: [],
    });
  });

  it('should handle JSON parsing errors', async () => {
    const jsonError = new Error('Invalid JSON');
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.reject(jsonError),
    });

    const result = await getProviderData(mockEnvId);

    expect(mockFetch).toHaveBeenCalledWith(accessPoint);
    expect(logErrorSpy).toHaveBeenCalledWith(
      Flagship.getConfig(),
      'Invalid JSON',
      'getProviderData',
    );
    expect(result).toEqual({
      definitions: {},
      hints: [],
    });
  });

  it('should handle non-Error objects in catch block', async () => {
    mockFetch.mockRejectedValue('string error');

    const result = await getProviderData(mockEnvId);

    expect(mockFetch).toHaveBeenCalledWith(accessPoint);

    expect(logErrorSpy).toHaveBeenCalledWith(
      Flagship.getConfig(),
      'Unknown error fetching provider data',
      'getProviderData',
    );
    expect(result).toEqual({
      definitions: {},
      hints: [],
    });
  });

  it('should handle empty campaigns array', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ campaigns: [] }),
    });

    const result = await getProviderData(mockEnvId);

    expect(result).toEqual({
      definitions: {},
      hints: [],
    });
  });
});
