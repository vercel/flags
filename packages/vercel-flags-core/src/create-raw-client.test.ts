import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { controllerInstanceMap } from './controller-instance-map';
import { createCreateRawClient } from './create-raw-client';
import type { BundledDefinitions, ControllerInterface } from './types';

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

function createMockFns() {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
    getFallbackDatafile: vi.fn().mockResolvedValue({
      projectId: 'test',
      definitions: {},
      environment: 'production',
      configUpdatedAt: 1,
      digest: 'a',
      revision: 1,
    } satisfies BundledDefinitions),
    evaluate: vi.fn().mockResolvedValue({ value: true, reason: 'static' }),
    getDatafile: vi.fn().mockResolvedValue({
      projectId: 'test',
      definitions: {},
      segments: {},
      environment: 'production',
      metrics: {
        readMs: 0,
        source: 'in-memory',
        cacheStatus: 'HIT',
      },
    }),
  };
}

describe('createCreateRawClient', () => {
  beforeEach(() => {
    controllerInstanceMap.clear();
  });

  afterEach(() => {
    controllerInstanceMap.clear();
  });

  describe('client creation', () => {
    it('should add controller to controllerInstanceMap on creation', () => {
      const fns = createMockFns();
      const createRawClient = createCreateRawClient(fns);
      const controller = createMockController();

      expect(controllerInstanceMap.size).toBe(0);

      createRawClient({ controller });

      expect(controllerInstanceMap.size).toBe(1);
    });

    it('should store the correct controller in controllerInstanceMap', () => {
      const fns = createMockFns();
      const createRawClient = createCreateRawClient(fns);
      const controller = createMockController();

      const initialSize = controllerInstanceMap.size;
      createRawClient({ controller });

      // The controller should be stored in the map
      expect(controllerInstanceMap.size).toBe(initialSize + 1);
      // Find the entry that was just added
      const entries = Array.from(controllerInstanceMap.entries());
      const lastEntry = entries[entries.length - 1];
      expect(lastEntry?.[1].controller).toBe(controller);
    });

    it('should assign incrementing IDs to each client', () => {
      const fns = createMockFns();
      const createRawClient = createCreateRawClient(fns);

      const ds1 = createMockController();
      const ds2 = createMockController();
      const ds3 = createMockController();

      const initialSize = controllerInstanceMap.size;

      createRawClient({ controller: ds1 });
      createRawClient({ controller: ds2 });
      createRawClient({ controller: ds3 });

      expect(controllerInstanceMap.size).toBe(initialSize + 3);
      // Each controller should be stored under a different key
      const entries = Array.from(controllerInstanceMap.entries()).slice(-3);
      expect(entries?.[0]?.[1].controller).toBe(ds1);
      expect(entries?.[1]?.[1].controller).toBe(ds2);
      expect(entries?.[2]?.[1].controller).toBe(ds3);
      // IDs should be incrementing
      expect(entries?.[1]?.[0]).toBe(entries![0]![0] + 1);
      expect(entries?.[2]?.[0]).toBe(entries![1]![0] + 1);
    });
  });

  describe('initialize', () => {
    it('should call fns.initialize with the client ID', async () => {
      const fns = createMockFns();
      const createRawClient = createCreateRawClient(fns);
      const controller = createMockController();

      const client = createRawClient({ controller });
      await client.initialize();

      expect(fns.initialize).toHaveBeenCalledTimes(1);
      // The ID passed should be consistent
      expect(fns.initialize).toHaveBeenCalledWith(expect.any(Number));
    });

    it('should re-add controller to controllerInstanceMap if removed', async () => {
      const fns = createMockFns();
      const createRawClient = createCreateRawClient(fns);
      const controller = createMockController();

      const client = createRawClient({ controller });

      // Simulate removal from map (e.g., after shutdown)
      controllerInstanceMap.clear();
      expect(controllerInstanceMap.size).toBe(0);

      await client.initialize();

      // Should be re-added
      expect(controllerInstanceMap.size).toBe(1);
    });

    it('should not duplicate if already in controllerInstanceMap', async () => {
      const fns = createMockFns();
      const createRawClient = createCreateRawClient(fns);
      const controller = createMockController();

      const client = createRawClient({ controller });

      expect(controllerInstanceMap.size).toBe(1);

      await client.initialize();

      expect(controllerInstanceMap.size).toBe(1);
    });

    it('should deduplicate concurrent initialize() calls', async () => {
      const fns = createMockFns();
      // Make initialize take some time so concurrent calls overlap
      fns.initialize.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 50)),
      );
      const createRawClient = createCreateRawClient(fns);
      const controller = createMockController();

      const client = createRawClient({ controller });

      await Promise.all([
        client.initialize(),
        client.initialize(),
        client.initialize(),
      ]);

      expect(fns.initialize).toHaveBeenCalledTimes(1);
    });

    it('should deduplicate concurrent evaluate() calls that trigger initialize()', async () => {
      const fns = createMockFns();
      fns.initialize.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 50)),
      );
      const createRawClient = createCreateRawClient(fns);
      const controller = createMockController();

      const client = createRawClient({ controller });

      await Promise.all([
        client.evaluate('flag-a'),
        client.evaluate('flag-b'),
        client.evaluate('flag-c'),
      ]);

      expect(fns.initialize).toHaveBeenCalledTimes(1);
      expect(fns.evaluate).toHaveBeenCalledTimes(3);
    });

    it('should allow re-initialization after failure', async () => {
      const fns = createMockFns();
      fns.initialize
        .mockRejectedValueOnce(new Error('init failed'))
        .mockResolvedValueOnce(undefined);
      const createRawClient = createCreateRawClient(fns);
      const controller = createMockController();

      const client = createRawClient({ controller });

      await expect(client.initialize()).rejects.toThrow('init failed');
      await client.initialize();

      expect(fns.initialize).toHaveBeenCalledTimes(2);
    });
  });

  describe('shutdown', () => {
    it('should call fns.shutdown with the client ID', async () => {
      const fns = createMockFns();
      const createRawClient = createCreateRawClient(fns);
      const controller = createMockController();

      const client = createRawClient({ controller });
      await client.shutdown();

      expect(fns.shutdown).toHaveBeenCalledTimes(1);
      expect(fns.shutdown).toHaveBeenCalledWith(expect.any(Number));
    });

    it('should remove controller from controllerInstanceMap after shutdown', async () => {
      const fns = createMockFns();
      const createRawClient = createCreateRawClient(fns);
      const controller = createMockController();

      const client = createRawClient({ controller });

      expect(controllerInstanceMap.size).toBe(1);

      await client.shutdown();

      expect(controllerInstanceMap.size).toBe(0);
    });
  });

  describe('getFallbackDatafile', () => {
    it('should call fns.getFallbackDatafile with the client ID', async () => {
      const fns = createMockFns();
      const createRawClient = createCreateRawClient(fns);
      const controller = createMockController();

      const client = createRawClient({ controller });
      await client.getFallbackDatafile();

      expect(fns.getFallbackDatafile).toHaveBeenCalledTimes(1);
      expect(fns.getFallbackDatafile).toHaveBeenCalledWith(expect.any(Number));
    });

    it('should return the fallback definitions', async () => {
      const fns = createMockFns();
      const mockFallback = {
        projectId: 'test-project',
        definitions: {},
        environment: 'production',
        configUpdatedAt: 123,
        digest: 'abc',
        revision: 2,
      } satisfies BundledDefinitions;
      fns.getFallbackDatafile.mockResolvedValue(mockFallback);
      const createRawClient = createCreateRawClient(fns);
      const controller = createMockController();

      const client = createRawClient({ controller });
      const result = await client.getFallbackDatafile();

      expect(result).toEqual(mockFallback);
    });

    it('should propagate errors from fns.getFallbackDatafile', async () => {
      const fns = createMockFns();
      fns.getFallbackDatafile.mockRejectedValue(
        new Error('Fallback not supported'),
      );
      const createRawClient = createCreateRawClient(fns);
      const controller = createMockController();

      const client = createRawClient({ controller });

      await expect(client.getFallbackDatafile()).rejects.toThrow(
        'Fallback not supported',
      );
    });
  });

  describe('evaluate', () => {
    it('should call fns.evaluate with correct arguments', async () => {
      const fns = createMockFns();
      const createRawClient = createCreateRawClient(fns);
      const controller = createMockController();

      const client = createRawClient({ controller });
      await client.evaluate('my-flag', false, { user: { id: '123' } });

      expect(fns.evaluate).toHaveBeenCalledTimes(1);
      expect(fns.evaluate).toHaveBeenCalledWith(
        expect.any(Number),
        'my-flag',
        false,
        { user: { id: '123' } },
      );
    });

    it('should return the evaluation result', async () => {
      const fns = createMockFns();
      const expectedResult = {
        value: 'variant-a',
        reason: 'targeting',
        outcomeType: 'value',
      };
      fns.evaluate.mockResolvedValue(expectedResult);
      const createRawClient = createCreateRawClient(fns);
      const controller = createMockController();

      const client = createRawClient({ controller });
      const result = await client.evaluate('my-flag');

      expect(result).toEqual(expectedResult);
    });

    it('should work with generic types', async () => {
      const fns = createMockFns();
      fns.evaluate.mockResolvedValue({ value: 42, reason: 'static' });
      const createRawClient = createCreateRawClient(fns);
      const controller = createMockController();

      const client = createRawClient({ controller });
      const result = await client.evaluate<number>('numeric-flag', 0);

      expect(result.value).toBe(42);
    });
  });

  describe('multiple clients', () => {
    it('should maintain independent state for each client', async () => {
      const fns = createMockFns();
      const createRawClient = createCreateRawClient(fns);

      const ds1 = createMockController();
      const ds2 = createMockController();

      const initialSize = controllerInstanceMap.size;

      const client1 = createRawClient({ controller: ds1 });
      const client2 = createRawClient({ controller: ds2 });

      expect(controllerInstanceMap.size).toBe(initialSize + 2);

      // Shutdown client1
      await client1.shutdown();

      // client2 should still be in the map
      expect(controllerInstanceMap.size).toBe(initialSize + 1);
      // ds2 should still be in the map
      const controllers = Array.from(controllerInstanceMap.values()).map(
        (v) => v.controller,
      );
      expect(controllers).toContain(ds2);
      await client2.shutdown();
    });

    it('should use correct ID for each client method call', async () => {
      const fns = createMockFns();
      const createRawClient = createCreateRawClient(fns);

      const ds1 = createMockController();
      const ds2 = createMockController();

      const client1 = createRawClient({ controller: ds1 });
      const client2 = createRawClient({ controller: ds2 });

      await client1.evaluate('flag1');
      await client2.evaluate('flag2');

      expect(fns.evaluate).toHaveBeenCalledTimes(2);
      // First call should use client1's ID (lower)
      const call1Id = fns.evaluate.mock.calls?.[0]?.[0];
      const call2Id = fns.evaluate.mock.calls?.[1]?.[0];
      expect(call1Id).toBeLessThan(call2Id);
    });
  });
});
