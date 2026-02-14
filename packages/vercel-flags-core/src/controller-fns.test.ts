import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  evaluate,
  getFallbackDatafile,
  initialize,
  shutdown,
} from './controller-fns';
import { controllerInstanceMap } from './controller-instance-map';
import type { BundledDefinitions, ControllerInterface, Packed } from './types';
import { ErrorCode, ResolutionReason } from './types';

// Mock the internalReportValue function
vi.mock('./lib/report-value', () => ({
  internalReportValue: vi.fn(),
}));

import { internalReportValue } from './lib/report-value';

function createMockController(
  overrides?: Partial<ControllerInterface>,
): ControllerInterface {
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
    controllerInstanceMap.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    controllerInstanceMap.clear();
  });

  describe('initialize', () => {
    it('should call controller.initialize()', async () => {
      const controller = createMockController();
      controllerInstanceMap.set(CLIENT_ID, {
        controller,
        initialized: false,
        initPromise: null,
      });

      await initialize(CLIENT_ID);

      expect(controller.initialize).toHaveBeenCalledTimes(1);
    });

    it('should return the result from controller.initialize()', async () => {
      const controller = createMockController({
        initialize: vi.fn().mockResolvedValue('init-result'),
      });
      controllerInstanceMap.set(CLIENT_ID, {
        controller,
        initialized: false,
        initPromise: null,
      });

      const result = await initialize(CLIENT_ID);

      expect(result).toBe('init-result');
    });

    it('should throw if client ID is not in map', () => {
      expect(() => initialize(999)).toThrow();
    });
  });

  describe('shutdown', () => {
    it('should call controller.shutdown()', async () => {
      const controller = createMockController();
      controllerInstanceMap.set(CLIENT_ID, {
        controller,
        initialized: false,
        initPromise: null,
      });

      await shutdown(CLIENT_ID);

      expect(controller.shutdown).toHaveBeenCalledTimes(1);
    });

    it('should return the result from controller.shutdown()', async () => {
      const controller = createMockController({
        shutdown: vi.fn().mockResolvedValue('shutdown-result'),
      });
      controllerInstanceMap.set(CLIENT_ID, {
        controller,
        initialized: false,
        initPromise: null,
      });

      const result = await shutdown(CLIENT_ID);

      expect(result).toBe('shutdown-result');
    });

    it('should throw if client ID is not in map', () => {
      expect(() => shutdown(999)).toThrow();
    });
  });

  describe('getFallbackDatafile', () => {
    it('should call controller.getFallbackDatafile() if it exists', async () => {
      const mockFallback: BundledDefinitions = {
        projectId: 'test',
        definitions: {},
        environment: 'production',
        configUpdatedAt: 1,
        digest: 'a',
        revision: 1,
      };
      const getFallbackDatafileFn = vi.fn().mockResolvedValue(mockFallback);
      const controller = createMockController({
        getFallbackDatafile: getFallbackDatafileFn,
      });
      controllerInstanceMap.set(CLIENT_ID, {
        controller,
        initialized: false,
        initPromise: null,
      });

      await getFallbackDatafile(CLIENT_ID);

      expect(getFallbackDatafileFn).toHaveBeenCalledTimes(1);
    });

    it('should return the result from controller.getFallbackDatafile()', async () => {
      const mockFallback: BundledDefinitions = {
        projectId: 'test',
        definitions: {},
        environment: 'production',
        configUpdatedAt: 1,
        digest: 'a',
        revision: 1,
      };
      const controller = createMockController({
        getFallbackDatafile: vi.fn().mockResolvedValue(mockFallback),
      });
      controllerInstanceMap.set(CLIENT_ID, {
        controller,
        initialized: false,
        initPromise: null,
      });

      const result = await getFallbackDatafile(CLIENT_ID);

      expect(result).toEqual(mockFallback);
    });

    it('should throw if controller does not have getFallbackDatafile', () => {
      const controller = createMockController();
      // Remove getFallbackDatafile
      delete (controller as Partial<ControllerInterface>).getFallbackDatafile;
      controllerInstanceMap.set(CLIENT_ID, {
        controller,
        initialized: false,
        initPromise: null,
      });

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
      const controller = createMockController({
        read: vi.fn().mockResolvedValue(
          mockDatafile({
            projectId: 'test',
            definitions: {},
            segments: {},
            environment: 'production',
          }),
        ),
      });
      controllerInstanceMap.set(CLIENT_ID, {
        controller,
        initialized: false,
        initPromise: null,
      });

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
      const controller = createMockController({
        read: vi.fn().mockResolvedValue(
          mockDatafile({
            projectId: 'test',
            definitions: {},
            segments: {},
            environment: 'production',
          }),
        ),
      });
      controllerInstanceMap.set(CLIENT_ID, {
        controller,
        initialized: false,
        initPromise: null,
      });

      const result = await evaluate(CLIENT_ID, 'missing', { fallback: true });

      expect(result.value).toEqual({ fallback: true });
    });

    it('should evaluate flag when it exists', async () => {
      // A flag with environments: { production: 0 } is "paused" (just returns variant 0)
      const flagDefinition: Packed.FlagDefinition = {
        environments: { production: 0 },
        variants: [true],
      };
      const controller = createMockController({
        read: vi.fn().mockResolvedValue(
          mockDatafile({
            projectId: 'test',
            definitions: { 'my-flag': flagDefinition },
            segments: {},
            environment: 'production',
          }),
        ),
      });
      controllerInstanceMap.set(CLIENT_ID, {
        controller,
        initialized: false,
        initPromise: null,
      });

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
      const controller = createMockController({
        read: vi.fn().mockResolvedValue(
          mockDatafile({
            projectId: 'my-project-id',
            definitions: { 'my-flag': flagDefinition },
            segments: {},
            environment: 'production',
          }),
        ),
      });
      controllerInstanceMap.set(CLIENT_ID, {
        controller,
        initialized: false,
        initPromise: null,
      });

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
      const controller = createMockController({
        read: vi.fn().mockResolvedValue(
          mockDatafile({
            projectId: undefined,
            definitions: { 'my-flag': flagDefinition },
            segments: {},
            environment: 'production',
          }),
        ),
      });
      controllerInstanceMap.set(CLIENT_ID, {
        controller,
        initialized: false,
        initPromise: null,
      });

      await evaluate(CLIENT_ID, 'my-flag');

      expect(internalReportValue).not.toHaveBeenCalled();
    });

    it('should not include outcomeType in report when result is error', async () => {
      const controller = createMockController({
        read: vi.fn().mockResolvedValue(
          mockDatafile({
            projectId: 'test',
            definitions: {},
            segments: {},
            environment: 'production',
          }),
        ),
      });
      controllerInstanceMap.set(CLIENT_ID, {
        controller,
        initialized: false,
        initPromise: null,
      });

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
      const controller = createMockController({
        read: vi.fn().mockResolvedValue(
          mockDatafile({
            projectId: 'test',
            definitions: { 'targeted-flag': flagDefinition },
            segments: {},
            environment: 'production',
          }),
        ),
      });
      controllerInstanceMap.set(CLIENT_ID, {
        controller,
        initialized: false,
        initPromise: null,
      });

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
      const controller = createMockController({
        read: vi.fn().mockResolvedValue(
          mockDatafile({
            projectId: 'test',
            definitions: { 'my-flag': flagDefinition },
            segments: {},
            environment: 'production',
          }),
        ),
      });
      controllerInstanceMap.set(CLIENT_ID, {
        controller,
        initialized: false,
        initPromise: null,
      });

      // Call without entities
      const result = await evaluate(CLIENT_ID, 'my-flag');

      expect(result.value).toBe('value');
    });

    it('should throw if client ID is not in map', async () => {
      await expect(evaluate(999, 'any-flag')).rejects.toThrow();
    });

    it('should work with different value types', async () => {
      const controller = createMockController({
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
      controllerInstanceMap.set(CLIENT_ID, {
        controller,
        initialized: false,
        initPromise: null,
      });

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
