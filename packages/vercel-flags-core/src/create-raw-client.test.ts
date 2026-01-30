import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clientMap } from './client-map';
import { createCreateRawClient } from './create-raw-client';
import type { DataSource } from './types';

function createMockDataSource(overrides?: Partial<DataSource>): DataSource {
  return {
    read: vi.fn().mockResolvedValue({
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

function createMockFns() {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
    ensureFallback: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue({ value: true, reason: 'static' }),
    getMetadata: vi.fn().mockResolvedValue({ projectId: 'test' }),
  };
}

describe('createCreateRawClient', () => {
  beforeEach(() => {
    clientMap.clear();
  });

  afterEach(() => {
    clientMap.clear();
  });

  describe('client creation', () => {
    it('should add dataSource to clientMap on creation', () => {
      const fns = createMockFns();
      const createRawClient = createCreateRawClient(fns);
      const dataSource = createMockDataSource();

      expect(clientMap.size).toBe(0);

      createRawClient({ dataSource });

      expect(clientMap.size).toBe(1);
    });

    it('should store the correct dataSource in clientMap', () => {
      const fns = createMockFns();
      const createRawClient = createCreateRawClient(fns);
      const dataSource = createMockDataSource();

      const initialSize = clientMap.size;
      createRawClient({ dataSource });

      // The dataSource should be stored in the map
      expect(clientMap.size).toBe(initialSize + 1);
      // Find the entry that was just added
      const entries = Array.from(clientMap.entries());
      const lastEntry = entries[entries.length - 1];
      expect(lastEntry[1]).toBe(dataSource);
    });

    it('should assign incrementing IDs to each client', () => {
      const fns = createMockFns();
      const createRawClient = createCreateRawClient(fns);

      const ds1 = createMockDataSource();
      const ds2 = createMockDataSource();
      const ds3 = createMockDataSource();

      const initialSize = clientMap.size;

      createRawClient({ dataSource: ds1 });
      createRawClient({ dataSource: ds2 });
      createRawClient({ dataSource: ds3 });

      expect(clientMap.size).toBe(initialSize + 3);
      // Each dataSource should be stored under a different key
      const entries = Array.from(clientMap.entries()).slice(-3);
      expect(entries[0][1]).toBe(ds1);
      expect(entries[1][1]).toBe(ds2);
      expect(entries[2][1]).toBe(ds3);
      // IDs should be incrementing
      expect(entries[1][0]).toBe(entries[0][0] + 1);
      expect(entries[2][0]).toBe(entries[1][0] + 1);
    });
  });

  describe('initialize', () => {
    it('should call fns.initialize with the client ID', async () => {
      const fns = createMockFns();
      const createRawClient = createCreateRawClient(fns);
      const dataSource = createMockDataSource();

      const client = createRawClient({ dataSource });
      await client.initialize();

      expect(fns.initialize).toHaveBeenCalledTimes(1);
      // The ID passed should be consistent
      expect(fns.initialize).toHaveBeenCalledWith(expect.any(Number));
    });

    it('should re-add dataSource to clientMap if removed', async () => {
      const fns = createMockFns();
      const createRawClient = createCreateRawClient(fns);
      const dataSource = createMockDataSource();

      const client = createRawClient({ dataSource });

      // Simulate removal from map (e.g., after shutdown)
      clientMap.clear();
      expect(clientMap.size).toBe(0);

      await client.initialize();

      // Should be re-added
      expect(clientMap.size).toBe(1);
    });

    it('should not duplicate if already in clientMap', async () => {
      const fns = createMockFns();
      const createRawClient = createCreateRawClient(fns);
      const dataSource = createMockDataSource();

      const client = createRawClient({ dataSource });

      expect(clientMap.size).toBe(1);

      await client.initialize();

      expect(clientMap.size).toBe(1);
    });
  });

  describe('shutdown', () => {
    it('should call fns.shutdown with the client ID', async () => {
      const fns = createMockFns();
      const createRawClient = createCreateRawClient(fns);
      const dataSource = createMockDataSource();

      const client = createRawClient({ dataSource });
      await client.shutdown();

      expect(fns.shutdown).toHaveBeenCalledTimes(1);
      expect(fns.shutdown).toHaveBeenCalledWith(expect.any(Number));
    });

    it('should remove dataSource from clientMap after shutdown', async () => {
      const fns = createMockFns();
      const createRawClient = createCreateRawClient(fns);
      const dataSource = createMockDataSource();

      const client = createRawClient({ dataSource });

      expect(clientMap.size).toBe(1);

      await client.shutdown();

      expect(clientMap.size).toBe(0);
    });
  });

  describe('getMetadata', () => {
    it('should call fns.getMetadata with the client ID', async () => {
      const fns = createMockFns();
      const createRawClient = createCreateRawClient(fns);
      const dataSource = createMockDataSource();

      const client = createRawClient({ dataSource });
      await client.getMetadata();

      expect(fns.getMetadata).toHaveBeenCalledTimes(1);
      expect(fns.getMetadata).toHaveBeenCalledWith(expect.any(Number));
    });

    it('should return the result from fns.getMetadata', async () => {
      const fns = createMockFns();
      fns.getMetadata.mockResolvedValue({ projectId: 'my-project' });
      const createRawClient = createCreateRawClient(fns);
      const dataSource = createMockDataSource();

      const client = createRawClient({ dataSource });
      const result = await client.getMetadata();

      expect(result).toEqual({ projectId: 'my-project' });
    });
  });

  describe('ensureFallback', () => {
    it('should call fns.ensureFallback with the client ID', async () => {
      const fns = createMockFns();
      const createRawClient = createCreateRawClient(fns);
      const dataSource = createMockDataSource();

      const client = createRawClient({ dataSource });
      await client.ensureFallback();

      expect(fns.ensureFallback).toHaveBeenCalledTimes(1);
      expect(fns.ensureFallback).toHaveBeenCalledWith(expect.any(Number));
    });

    it('should propagate errors from fns.ensureFallback', async () => {
      const fns = createMockFns();
      fns.ensureFallback.mockRejectedValue(new Error('Fallback not supported'));
      const createRawClient = createCreateRawClient(fns);
      const dataSource = createMockDataSource();

      const client = createRawClient({ dataSource });

      await expect(client.ensureFallback()).rejects.toThrow(
        'Fallback not supported',
      );
    });
  });

  describe('evaluate', () => {
    it('should call fns.evaluate with correct arguments', async () => {
      const fns = createMockFns();
      const createRawClient = createCreateRawClient(fns);
      const dataSource = createMockDataSource();

      const client = createRawClient({ dataSource });
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
      const dataSource = createMockDataSource();

      const client = createRawClient({ dataSource });
      const result = await client.evaluate('my-flag');

      expect(result).toEqual(expectedResult);
    });

    it('should work with generic types', async () => {
      const fns = createMockFns();
      fns.evaluate.mockResolvedValue({ value: 42, reason: 'static' });
      const createRawClient = createCreateRawClient(fns);
      const dataSource = createMockDataSource();

      const client = createRawClient({ dataSource });
      const result = await client.evaluate<number>('numeric-flag', 0);

      expect(result.value).toBe(42);
    });
  });

  describe('multiple clients', () => {
    it('should maintain independent state for each client', async () => {
      const fns = createMockFns();
      const createRawClient = createCreateRawClient(fns);

      const ds1 = createMockDataSource();
      const ds2 = createMockDataSource();

      const initialSize = clientMap.size;

      const client1 = createRawClient({ dataSource: ds1 });
      const client2 = createRawClient({ dataSource: ds2 });

      expect(clientMap.size).toBe(initialSize + 2);

      // Shutdown client1
      await client1.shutdown();

      // client2 should still be in the map
      expect(clientMap.size).toBe(initialSize + 1);
      // ds2 should still be in the map
      const values = Array.from(clientMap.values());
      expect(values).toContain(ds2);
    });

    it('should use correct ID for each client method call', async () => {
      const fns = createMockFns();
      const createRawClient = createCreateRawClient(fns);

      const ds1 = createMockDataSource();
      const ds2 = createMockDataSource();

      const client1 = createRawClient({ dataSource: ds1 });
      const client2 = createRawClient({ dataSource: ds2 });

      await client1.evaluate('flag1');
      await client2.evaluate('flag2');

      expect(fns.evaluate).toHaveBeenCalledTimes(2);
      // First call should use client1's ID (lower)
      const call1Id = fns.evaluate.mock.calls[0][0];
      const call2Id = fns.evaluate.mock.calls[1][0];
      expect(call1Id).toBeLessThan(call2Id);
    });
  });
});
