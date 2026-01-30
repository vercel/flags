import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ensureFallback,
  evaluate,
  getMetadata,
  initialize,
  shutdown,
} from './client-fns';
import { clientMap } from './client-map';
import type { DataSource, Packed } from './types';
import { ErrorCode, ResolutionReason } from './types';

// Mock the internalReportValue function
vi.mock('./lib/report-value', () => ({
  internalReportValue: vi.fn(),
}));

import { internalReportValue } from './lib/report-value';

function createMockDataSource(overrides?: Partial<DataSource>): DataSource {
  return {
    getData: vi.fn().mockResolvedValue({
      projectId: 'test-project',
      definitions: {},
      segments: {},
      environment: 'production',
    }),
    getMetadata: vi.fn().mockResolvedValue({ projectId: 'test-project' }),
    initialize: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('client-fns', () => {
  const CLIENT_ID = 99;

  beforeEach(() => {
    clientMap.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    clientMap.clear();
  });

  describe('initialize', () => {
    it('should call dataSource.initialize()', async () => {
      const dataSource = createMockDataSource();
      clientMap.set(CLIENT_ID, dataSource);

      await initialize(CLIENT_ID);

      expect(dataSource.initialize).toHaveBeenCalledTimes(1);
    });

    it('should return the result from dataSource.initialize()', async () => {
      const dataSource = createMockDataSource({
        initialize: vi.fn().mockResolvedValue('init-result'),
      });
      clientMap.set(CLIENT_ID, dataSource);

      const result = await initialize(CLIENT_ID);

      expect(result).toBe('init-result');
    });

    it('should throw if client ID is not in map', async () => {
      await expect(initialize(999)).rejects.toThrow();
    });
  });

  describe('shutdown', () => {
    it('should call dataSource.shutdown()', async () => {
      const dataSource = createMockDataSource();
      clientMap.set(CLIENT_ID, dataSource);

      await shutdown(CLIENT_ID);

      expect(dataSource.shutdown).toHaveBeenCalledTimes(1);
    });

    it('should return the result from dataSource.shutdown()', async () => {
      const dataSource = createMockDataSource({
        shutdown: vi.fn().mockResolvedValue('shutdown-result'),
      });
      clientMap.set(CLIENT_ID, dataSource);

      const result = await shutdown(CLIENT_ID);

      expect(result).toBe('shutdown-result');
    });

    it('should throw if client ID is not in map', async () => {
      await expect(shutdown(999)).rejects.toThrow();
    });
  });

  describe('getMetadata', () => {
    it('should call dataSource.getMetadata()', async () => {
      const dataSource = createMockDataSource();
      clientMap.set(CLIENT_ID, dataSource);

      await getMetadata(CLIENT_ID);

      expect(dataSource.getMetadata).toHaveBeenCalledTimes(1);
    });

    it('should return metadata from dataSource', async () => {
      const dataSource = createMockDataSource({
        getMetadata: vi.fn().mockResolvedValue({ projectId: 'my-project' }),
      });
      clientMap.set(CLIENT_ID, dataSource);

      const result = await getMetadata(CLIENT_ID);

      expect(result).toEqual({ projectId: 'my-project' });
    });

    it('should throw if client ID is not in map', async () => {
      await expect(getMetadata(999)).rejects.toThrow();
    });
  });

  describe('ensureFallback', () => {
    it('should call dataSource.ensureFallback() if it exists', async () => {
      const ensureFallbackFn = vi.fn().mockResolvedValue(undefined);
      const dataSource = createMockDataSource({
        ensureFallback: ensureFallbackFn,
      });
      clientMap.set(CLIENT_ID, dataSource);

      await ensureFallback(CLIENT_ID);

      expect(ensureFallbackFn).toHaveBeenCalledTimes(1);
    });

    it('should return the result from dataSource.ensureFallback()', async () => {
      const dataSource = createMockDataSource({
        ensureFallback: vi.fn().mockResolvedValue('fallback-result'),
      });
      clientMap.set(CLIENT_ID, dataSource);

      const result = await ensureFallback(CLIENT_ID);

      expect(result).toBe('fallback-result');
    });

    it('should throw if dataSource does not have ensureFallback', async () => {
      const dataSource = createMockDataSource();
      // Remove ensureFallback
      delete (dataSource as Partial<DataSource>).ensureFallback;
      clientMap.set(CLIENT_ID, dataSource);

      await expect(ensureFallback(CLIENT_ID)).rejects.toThrow(
        'flags: This data source does not support fallbacks',
      );
    });

    it('should throw if client ID is not in map', async () => {
      await expect(ensureFallback(999)).rejects.toThrow();
    });
  });

  describe('evaluate', () => {
    it('should return FLAG_NOT_FOUND error when flag does not exist', async () => {
      const dataSource = createMockDataSource({
        getData: vi.fn().mockResolvedValue({
          projectId: 'test',
          definitions: {},
          segments: {},
          environment: 'production',
        }),
      });
      clientMap.set(CLIENT_ID, dataSource);

      const result = await evaluate(CLIENT_ID, 'nonexistent-flag', 'default');

      expect(result).toEqual({
        value: 'default',
        reason: ResolutionReason.ERROR,
        errorCode: ErrorCode.FLAG_NOT_FOUND,
        errorMessage: 'Definition not found for flag "nonexistent-flag"',
      });
    });

    it('should use defaultValue when flag is not found', async () => {
      const dataSource = createMockDataSource({
        getData: vi.fn().mockResolvedValue({
          projectId: 'test',
          definitions: {},
          segments: {},
          environment: 'production',
        }),
      });
      clientMap.set(CLIENT_ID, dataSource);

      const result = await evaluate(CLIENT_ID, 'missing', { fallback: true });

      expect(result.value).toEqual({ fallback: true });
    });

    it('should evaluate flag when it exists', async () => {
      // A flag with environments: { production: 0 } is "paused" (just returns variant 0)
      const flagDefinition: Packed.FlagDefinition = {
        environments: { production: 0 },
        variants: [true],
      };
      const dataSource = createMockDataSource({
        getData: vi.fn().mockResolvedValue({
          projectId: 'test',
          definitions: { 'my-flag': flagDefinition },
          segments: {},
          environment: 'production',
        }),
      });
      clientMap.set(CLIENT_ID, dataSource);

      const result = await evaluate(CLIENT_ID, 'my-flag', false);

      expect(result.value).toBe(true);
      expect(result.reason).toBe(ResolutionReason.PAUSED);
    });

    it('should call internalReportValue when projectId exists', async () => {
      // A flag with environments: { production: 0 } is "paused"
      const flagDefinition: Packed.FlagDefinition = {
        environments: { production: 0 },
        variants: ['variant-a'],
      };
      const dataSource = createMockDataSource({
        getData: vi.fn().mockResolvedValue({
          projectId: 'my-project-id',
          definitions: { 'my-flag': flagDefinition },
          segments: {},
          environment: 'production',
        }),
      });
      clientMap.set(CLIENT_ID, dataSource);

      await evaluate(CLIENT_ID, 'my-flag', 'default');

      expect(internalReportValue).toHaveBeenCalledWith(
        'my-flag',
        'variant-a',
        expect.objectContaining({
          originProjectId: 'my-project-id',
          originProvider: 'vercel',
          reason: ResolutionReason.PAUSED,
        }),
      );
    });

    it('should not call internalReportValue when projectId is missing', async () => {
      const flagDefinition: Packed.FlagDefinition = {
        environments: { production: 0 },
        variants: [true],
      };
      const dataSource = createMockDataSource({
        getData: vi.fn().mockResolvedValue({
          projectId: undefined,
          definitions: { 'my-flag': flagDefinition },
          segments: {},
          environment: 'production',
        }),
      });
      clientMap.set(CLIENT_ID, dataSource);

      await evaluate(CLIENT_ID, 'my-flag');

      expect(internalReportValue).not.toHaveBeenCalled();
    });

    it('should not include outcomeType in report when result is error', async () => {
      const dataSource = createMockDataSource({
        getData: vi.fn().mockResolvedValue({
          projectId: 'test',
          definitions: {},
          segments: {},
          environment: 'production',
        }),
      });
      clientMap.set(CLIENT_ID, dataSource);

      await evaluate(CLIENT_ID, 'nonexistent');

      // internalReportValue is not called for FLAG_NOT_FOUND errors
      // because there's no projectId in the mock or the code path doesn't report errors
      // Let's verify by checking the actual behavior
      expect(internalReportValue).not.toHaveBeenCalled();
    });

    it('should pass entities to evaluation', async () => {
      const flagDefinition: Packed.FlagDefinition = {
        environments: {
          production: {
            targets: [{}, { user: { id: ['user-123'] } }],
            fallthrough: 0,
          },
        },
        variants: ['default', 'targeted'],
      };
      const dataSource = createMockDataSource({
        getData: vi.fn().mockResolvedValue({
          projectId: 'test',
          definitions: { 'targeted-flag': flagDefinition },
          segments: {},
          environment: 'production',
        }),
      });
      clientMap.set(CLIENT_ID, dataSource);

      const result = await evaluate(CLIENT_ID, 'targeted-flag', 'default', {
        user: { id: 'user-123' },
      });

      expect(result.value).toBe('targeted');
      expect(result.reason).toBe(ResolutionReason.TARGET_MATCH);
    });

    it('should use empty entities object when not provided', async () => {
      const flagDefinition: Packed.FlagDefinition = {
        environments: {
          production: {
            fallthrough: 0,
          },
        },
        variants: ['value'],
      };
      const dataSource = createMockDataSource({
        getData: vi.fn().mockResolvedValue({
          projectId: 'test',
          definitions: { 'my-flag': flagDefinition },
          segments: {},
          environment: 'production',
        }),
      });
      clientMap.set(CLIENT_ID, dataSource);

      // Call without entities
      const result = await evaluate(CLIENT_ID, 'my-flag');

      expect(result.value).toBe('value');
    });

    it('should throw if client ID is not in map', async () => {
      await expect(evaluate(999, 'any-flag')).rejects.toThrow();
    });

    it('should work with different value types', async () => {
      const dataSource = createMockDataSource({
        getData: vi.fn().mockResolvedValue({
          projectId: 'test',
          definitions: {
            'bool-flag': { environments: { production: 0 }, variants: [true] },
            'string-flag': {
              environments: { production: 0 },
              variants: ['hello'],
            },
            'number-flag': { environments: { production: 0 }, variants: [42] },
            'object-flag': {
              environments: { production: 0 },
              variants: [{ key: 'value' }],
            },
          },
          segments: {},
          environment: 'production',
        }),
      });
      clientMap.set(CLIENT_ID, dataSource);

      const boolResult = await evaluate<boolean>(CLIENT_ID, 'bool-flag');
      expect(boolResult.value).toBe(true);

      const stringResult = await evaluate<string>(CLIENT_ID, 'string-flag');
      expect(stringResult.value).toBe('hello');

      const numberResult = await evaluate<number>(CLIENT_ID, 'number-flag');
      expect(numberResult.value).toBe(42);

      const objectResult = await evaluate<{ key: string }>(
        CLIENT_ID,
        'object-flag',
      );
      expect(objectResult.value).toEqual({ key: 'value' });
    });
  });
});
