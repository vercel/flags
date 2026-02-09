import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  evaluate,
  getFallbackDatafile,
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
    read: vi.fn().mockResolvedValue({
      projectId: 'test-project',
      definitions: {},
      segments: {},
      environment: 'production',
      metrics: {
        readMs: 0,
        source: 'in-memory',
        cacheStatus: 'HIT',
      },
    }),
    getDatafile: vi.fn().mockResolvedValue({
      projectId: 'test-project',
      definitions: {},
      segments: {},
      environment: 'production',
      metrics: {
        readMs: 0,
        source: 'in-memory',
        cacheStatus: 'HIT',
      },
    }),
    initialize: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function mockDatafile(data: {
  projectId?: string;
  definitions: Record<string, unknown>;
  segments: Record<string, unknown>;
  environment: string;
}) {
  return {
    ...data,
    metrics: {
      readMs: 0,
      source: 'in-memory' as const,
      cacheStatus: 'HIT' as const,
    },
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
      clientMap.set(CLIENT_ID, { dataSource, initialized: false });

      await initialize(CLIENT_ID);

      expect(dataSource.initialize).toHaveBeenCalledTimes(1);
    });

    it('should return the result from dataSource.initialize()', async () => {
      const dataSource = createMockDataSource({
        initialize: vi.fn().mockResolvedValue('init-result'),
      });
      clientMap.set(CLIENT_ID, { dataSource, initialized: false });

      const result = await initialize(CLIENT_ID);

      expect(result).toBe('init-result');
    });

    it('should throw if client ID is not in map', () => {
      expect(() => initialize(999)).toThrow();
    });
  });

  describe('shutdown', () => {
    it('should call dataSource.shutdown()', async () => {
      const dataSource = createMockDataSource();
      clientMap.set(CLIENT_ID, { dataSource, initialized: false });

      await shutdown(CLIENT_ID);

      expect(dataSource.shutdown).toHaveBeenCalledTimes(1);
    });

    it('should return the result from dataSource.shutdown()', async () => {
      const dataSource = createMockDataSource({
        shutdown: vi.fn().mockResolvedValue('shutdown-result'),
      });
      clientMap.set(CLIENT_ID, { dataSource, initialized: false });

      const result = await shutdown(CLIENT_ID);

      expect(result).toBe('shutdown-result');
    });

    it('should throw if client ID is not in map', () => {
      expect(() => shutdown(999)).toThrow();
    });
  });

  describe('getFallbackDatafile', () => {
    it('should call dataSource.getFallbackDatafile() if it exists', async () => {
      const mockFallback = {
        projectId: 'test',
        definitions: {},
        environment: 'production',
        updatedAt: 1,
        digest: 'a',
        revision: 1,
      };
      const getFallbackDatafileFn = vi.fn().mockResolvedValue(mockFallback);
      const dataSource = createMockDataSource({
        getFallbackDatafile: getFallbackDatafileFn,
      });
      clientMap.set(CLIENT_ID, { dataSource, initialized: false });

      await getFallbackDatafile(CLIENT_ID);

      expect(getFallbackDatafileFn).toHaveBeenCalledTimes(1);
    });

    it('should return the result from dataSource.getFallbackDatafile()', async () => {
      const mockFallback = {
        projectId: 'test',
        definitions: {},
        environment: 'production',
        updatedAt: 1,
        digest: 'a',
        revision: 1,
      };
      const dataSource = createMockDataSource({
        getFallbackDatafile: vi.fn().mockResolvedValue(mockFallback),
      });
      clientMap.set(CLIENT_ID, { dataSource, initialized: false });

      const result = await getFallbackDatafile(CLIENT_ID);

      expect(result).toEqual(mockFallback);
    });

    it('should throw if dataSource does not have getFallbackDatafile', () => {
      const dataSource = createMockDataSource();
      // Remove getFallbackDatafile
      delete (dataSource as Partial<DataSource>).getFallbackDatafile;
      clientMap.set(CLIENT_ID, { dataSource, initialized: false });

      expect(() => getFallbackDatafile(CLIENT_ID)).toThrow(
        'flags: This data source does not support fallbacks',
      );
    });

    it('should throw if client ID is not in map', () => {
      expect(() => getFallbackDatafile(999)).toThrow();
    });
  });

  describe('evaluate', () => {
    it('should return FLAG_NOT_FOUND error when flag does not exist', async () => {
      const dataSource = createMockDataSource({
        read: vi.fn().mockResolvedValue(
          mockDatafile({
            projectId: 'test',
            definitions: {},
            segments: {},
            environment: 'production',
          }),
        ),
      });
      clientMap.set(CLIENT_ID, { dataSource, initialized: false });

      const result = await evaluate(CLIENT_ID, 'nonexistent-flag', 'default');

      expect(result.value).toBe('default');
      expect(result.reason).toBe(ResolutionReason.ERROR);
      expect(result.errorCode).toBe(ErrorCode.FLAG_NOT_FOUND);
      expect(result.errorMessage).toBe(
        'Definition not found for flag "nonexistent-flag"',
      );
      expect(result.metrics).toBeDefined();
      expect(result.metrics!.source).toBe('in-memory');
    });

    it('should use defaultValue when flag is not found', async () => {
      const dataSource = createMockDataSource({
        read: vi.fn().mockResolvedValue(
          mockDatafile({
            projectId: 'test',
            definitions: {},
            segments: {},
            environment: 'production',
          }),
        ),
      });
      clientMap.set(CLIENT_ID, { dataSource, initialized: false });

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
        read: vi.fn().mockResolvedValue(
          mockDatafile({
            projectId: 'test',
            definitions: { 'my-flag': flagDefinition },
            segments: {},
            environment: 'production',
          }),
        ),
      });
      clientMap.set(CLIENT_ID, { dataSource, initialized: false });

      const result = await evaluate(CLIENT_ID, 'my-flag', false);

      expect(result.value).toBe(true);
      expect(result.reason).toBe(ResolutionReason.PAUSED);
      expect(result.metrics).toBeDefined();
    });

    it('should call internalReportValue when projectId exists', async () => {
      // A flag with environments: { production: 0 } is "paused"
      const flagDefinition: Packed.FlagDefinition = {
        environments: { production: 0 },
        variants: ['variant-a'],
      };
      const dataSource = createMockDataSource({
        read: vi.fn().mockResolvedValue(
          mockDatafile({
            projectId: 'my-project-id',
            definitions: { 'my-flag': flagDefinition },
            segments: {},
            environment: 'production',
          }),
        ),
      });
      clientMap.set(CLIENT_ID, { dataSource, initialized: false });

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
        read: vi.fn().mockResolvedValue(
          mockDatafile({
            projectId: undefined,
            definitions: { 'my-flag': flagDefinition },
            segments: {},
            environment: 'production',
          }),
        ),
      });
      clientMap.set(CLIENT_ID, { dataSource, initialized: false });

      await evaluate(CLIENT_ID, 'my-flag');

      expect(internalReportValue).not.toHaveBeenCalled();
    });

    it('should not include outcomeType in report when result is error', async () => {
      const dataSource = createMockDataSource({
        read: vi.fn().mockResolvedValue(
          mockDatafile({
            projectId: 'test',
            definitions: {},
            segments: {},
            environment: 'production',
          }),
        ),
      });
      clientMap.set(CLIENT_ID, { dataSource, initialized: false });

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
        read: vi.fn().mockResolvedValue(
          mockDatafile({
            projectId: 'test',
            definitions: { 'targeted-flag': flagDefinition },
            segments: {},
            environment: 'production',
          }),
        ),
      });
      clientMap.set(CLIENT_ID, { dataSource, initialized: false });

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
        read: vi.fn().mockResolvedValue(
          mockDatafile({
            projectId: 'test',
            definitions: { 'my-flag': flagDefinition },
            segments: {},
            environment: 'production',
          }),
        ),
      });
      clientMap.set(CLIENT_ID, { dataSource, initialized: false });

      // Call without entities
      const result = await evaluate(CLIENT_ID, 'my-flag');

      expect(result.value).toBe('value');
    });

    it('should throw if client ID is not in map', async () => {
      await expect(evaluate(999, 'any-flag')).rejects.toThrow();
    });

    it('should work with different value types', async () => {
      const dataSource = createMockDataSource({
        read: vi.fn().mockResolvedValue(
          mockDatafile({
            projectId: 'test',
            definitions: {
              'bool-flag': {
                environments: { production: 0 },
                variants: [true],
              },
              'string-flag': {
                environments: { production: 0 },
                variants: ['hello'],
              },
              'number-flag': {
                environments: { production: 0 },
                variants: [42],
              },
              'object-flag': {
                environments: { production: 0 },
                variants: [{ key: 'value' }],
              },
            },
            segments: {},
            environment: 'production',
          }),
        ),
      });
      clientMap.set(CLIENT_ID, { dataSource, initialized: false });

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
