import { StandardResolutionReasons } from '@openfeature/server-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fns from './controller-fns';
import { createCreateRawClient } from './create-raw-client';
import { VercelProvider } from './openfeature.default';
import type { ControllerInterface, Datafile, Packed } from './types';

function createStaticController(opts: {
  data: Packed.Data;
  projectId: string;
  environment: string;
}): ControllerInterface {
  const datafile: Datafile = {
    ...opts.data,
    projectId: opts.projectId,
    environment: opts.environment,
    metrics: {
      readMs: 0,
      source: 'in-memory',
      cacheStatus: 'HIT',
      connectionState: 'connected',
      mode: 'streaming',
    },
  };
  return {
    initialize: () => Promise.resolve(),
    read: () => Promise.resolve(datafile),
    getDatafile: () => Promise.resolve(datafile),
    shutdown: () => {},
  };
}

const createRawClient = createCreateRawClient(fns);

describe('VercelProvider', () => {
  describe('constructor', () => {
    it('should accept a FlagsClient', () => {
      const controller = createStaticController({
        data: { definitions: {}, segments: {} },
        projectId: 'test',
        environment: 'production',
      });
      const client = createRawClient({ controller });
      const provider = new VercelProvider(client);

      expect(provider.metadata.name).toBe('vercel-nodejs-provider');
      expect(provider.runsOn).toBe('server');
    });

    it('should accept a connection string', () => {
      const connectionString =
        'flags:edgeConfigId=test&edgeConfigToken=test&sdkKey=vf_server_test_key';
      const provider = new VercelProvider(connectionString);

      expect(provider.metadata.name).toBe('vercel-nodejs-provider');
      expect(provider.runsOn).toBe('server');
    });
  });

  describe('resolveBooleanEvaluation', () => {
    it('should resolve a boolean flag', async () => {
      const controller = createStaticController({
        data: {
          definitions: {
            'boolean-flag': {
              environments: { production: 0 },
              variants: [true],
            } as Packed.FlagDefinition,
          },
          segments: {},
        },
        projectId: 'test',
        environment: 'production',
      });
      const client = createRawClient({ controller });
      const provider = new VercelProvider(client);

      const result = await provider.resolveBooleanEvaluation(
        'boolean-flag',
        false,
        {},
      );

      expect(result.value).toBe(true);
      expect(result.reason).toBe(StandardResolutionReasons.STATIC);
    });

    it('should return default value when flag is not found', async () => {
      const controller = createStaticController({
        data: { definitions: {}, segments: {} },
        projectId: 'test',
        environment: 'production',
      });
      const client = createRawClient({ controller });
      const provider = new VercelProvider(client);

      const result = await provider.resolveBooleanEvaluation(
        'nonexistent-flag',
        false,
        {},
      );

      expect(result.value).toBe(false);
      expect(result.reason).toBe(StandardResolutionReasons.ERROR);
      expect(result.errorMessage).toContain('Definition not found');
    });

    it('should use fallthrough outcome for active flags', async () => {
      const controller = createStaticController({
        data: {
          definitions: {
            'active-flag': {
              environments: {
                production: {
                  fallthrough: 1,
                },
              },
              variants: [false, true],
            } as Packed.FlagDefinition,
          },
          segments: {},
        },
        projectId: 'test',
        environment: 'production',
      });
      const client = createRawClient({ controller });
      const provider = new VercelProvider(client);

      const result = await provider.resolveBooleanEvaluation(
        'active-flag',
        false,
        {},
      );

      expect(result.value).toBe(true);
      expect(result.reason).toBe(StandardResolutionReasons.DEFAULT);
    });
  });

  describe('resolveStringEvaluation', () => {
    it('should resolve a string flag', async () => {
      const controller = createStaticController({
        data: {
          definitions: {
            'string-flag': {
              environments: { production: 0 },
              variants: ['variant-a'],
            } as Packed.FlagDefinition,
          },
          segments: {},
        },
        projectId: 'test',
        environment: 'production',
      });
      const client = createRawClient({ controller });
      const provider = new VercelProvider(client);

      const result = await provider.resolveStringEvaluation(
        'string-flag',
        'default',
        {},
      );

      expect(result.value).toBe('variant-a');
      expect(result.reason).toBe(StandardResolutionReasons.STATIC);
    });

    it('should return default value when flag is not found', async () => {
      const controller = createStaticController({
        data: { definitions: {}, segments: {} },
        projectId: 'test',
        environment: 'production',
      });
      const client = createRawClient({ controller });
      const provider = new VercelProvider(client);

      const result = await provider.resolveStringEvaluation(
        'nonexistent-flag',
        'default',
        {},
      );

      expect(result.value).toBe('default');
      expect(result.reason).toBe(StandardResolutionReasons.ERROR);
      expect(result.errorMessage).toContain('Definition not found');
    });
  });

  describe('resolveNumberEvaluation', () => {
    it('should resolve a number flag', async () => {
      const controller = createStaticController({
        data: {
          definitions: {
            'number-flag': {
              environments: { production: 0 },
              variants: [42],
            } as Packed.FlagDefinition,
          },
          segments: {},
        },
        projectId: 'test',
        environment: 'production',
      });
      const client = createRawClient({ controller });
      const provider = new VercelProvider(client);

      const result = await provider.resolveNumberEvaluation(
        'number-flag',
        0,
        {},
      );

      expect(result.value).toBe(42);
      expect(result.reason).toBe(StandardResolutionReasons.STATIC);
    });

    it('should return default value when flag is not found', async () => {
      const controller = createStaticController({
        data: { definitions: {}, segments: {} },
        projectId: 'test',
        environment: 'production',
      });
      const client = createRawClient({ controller });
      const provider = new VercelProvider(client);

      const result = await provider.resolveNumberEvaluation(
        'nonexistent-flag',
        100,
        {},
      );

      expect(result.value).toBe(100);
      expect(result.reason).toBe(StandardResolutionReasons.ERROR);
      expect(result.errorMessage).toContain('Definition not found');
    });
  });

  describe('resolveObjectEvaluation', () => {
    it('should resolve an object flag', async () => {
      const controller = createStaticController({
        data: {
          definitions: {
            'object-flag': {
              environments: { production: 0 },
              variants: ['value'],
            } as Packed.FlagDefinition,
          },
          segments: {},
        },
        projectId: 'test',
        environment: 'production',
      });
      const client = createRawClient({ controller });
      const provider = new VercelProvider(client);

      const result = await provider.resolveObjectEvaluation(
        'object-flag',
        {},
        {},
      );

      expect(result.value).toEqual('value');
      expect(result.reason).toBe(StandardResolutionReasons.STATIC);
    });

    it('should return default value when flag is not found', async () => {
      const controller = createStaticController({
        data: { definitions: {}, segments: {} },
        projectId: 'test',
        environment: 'production',
      });
      const client = createRawClient({ controller });
      const provider = new VercelProvider(client);

      const result = await provider.resolveObjectEvaluation(
        'nonexistent-flag',
        { default: true },
        {},
      );

      expect(result.value).toEqual({ default: true });
      expect(result.reason).toBe(StandardResolutionReasons.ERROR);
      expect(result.errorMessage).toContain('Definition not found');
    });
  });

  describe('initialize', () => {
    it('should initialize without errors', async () => {
      const controller = createStaticController({
        data: { definitions: {}, segments: {} },
        projectId: 'test',
        environment: 'production',
      });
      const client = createRawClient({ controller });
      const provider = new VercelProvider(client);

      await expect(provider.initialize()).resolves.toBeUndefined();
    });
  });

  describe('onClose', () => {
    it('should close without errors', async () => {
      const controller = createStaticController({
        data: { definitions: {}, segments: {} },
        projectId: 'test',
        environment: 'production',
      });
      const client = createRawClient({ controller });
      const provider = new VercelProvider(client);

      await expect(provider.onClose()).resolves.toBeUndefined();
    });
  });

  describe('context passing', () => {
    it('should pass evaluation context to the client', async () => {
      const controller = createStaticController({
        data: {
          definitions: {
            'context-flag': {
              environments: {
                production: {
                  targets: [{}, { user: { id: ['user-123'] } }],
                  fallthrough: 0,
                },
              },
              variants: ['variant-a', 'variant-b'],
            } as Packed.FlagDefinition,
          },
          segments: {},
        },
        projectId: 'test',
        environment: 'production',
      });
      const client = createRawClient({ controller });
      const provider = new VercelProvider(client);

      const result = await provider.resolveStringEvaluation(
        'context-flag',
        'default',
        { user: { id: 'user-123' } },
      );

      expect(result.value).toBe('variant-b');
      expect(result.reason).toBe(StandardResolutionReasons.TARGETING_MATCH);
    });
  });

  describe('hooks', () => {
    const SYMBOL_FOR_REQ_CONTEXT = Symbol.for('@vercel/request-context');

    afterEach(() => {
      Reflect.deleteProperty(globalThis, SYMBOL_FOR_REQ_CONTEXT);
    });

    function setUp() {
      const reportValue = vi.fn();
      Reflect.set(globalThis, SYMBOL_FOR_REQ_CONTEXT, {
        get: () => ({ flags: { reportValue } }),
      });
      const experimental_reportOverride = vi.fn(async () => {});
      const client = {
        ...createRawClient({
          controller: createStaticController({
            data: { definitions: {}, segments: {} },
            projectId: 'test',
            environment: 'production',
          }),
        }),
        experimental_reportOverride,
      };
      const provider = new VercelProvider(client);
      const runAfter = provider.hooks[0]?.after;
      if (!runAfter) throw new Error('no hook');
      return { reportValue, experimental_reportOverride, runAfter };
    }

    const hookContext = (flagKey: string) =>
      ({ flagKey, context: { user: { id: 'u1' } } }) as never;

    it('reports an override of the Flags SDK, as v4 did', async () => {
      const { reportValue, experimental_reportOverride, runAfter } = setUp();

      await runAfter(hookContext('my-flag'), {
        flagKey: 'my-flag',
        value: true,
        reason: 'OVERRIDE',
        flagMetadata: {},
      });

      expect(reportValue).toHaveBeenCalledWith(
        'my-flag',
        true,
        expect.objectContaining({
          originProvider: 'vercel',
          reason: 'override',
        }),
      );
      expect(experimental_reportOverride).toHaveBeenCalledWith({
        key: 'my-flag',
        value: true,
        entities: { user: { id: 'u1' } },
      });
    });

    it('does not report other evaluations, because the client reports them', async () => {
      const { reportValue, experimental_reportOverride, runAfter } = setUp();

      await runAfter(hookContext('my-flag'), {
        flagKey: 'my-flag',
        value: true,
        reason: StandardResolutionReasons.TARGETING_MATCH,
        flagMetadata: {},
      });

      expect(reportValue).not.toHaveBeenCalled();
      expect(experimental_reportOverride).not.toHaveBeenCalled();
    });
  });
});
