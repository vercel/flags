import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { createCreateRawClient } from './create-raw-client';
import { make } from './index.make';

// Mock the FlagNetworkDataSource to avoid real network calls
vi.mock('./data-source/flag-network-data-source', () => ({
  FlagNetworkDataSource: vi.fn().mockImplementation(({ sdkKey }) => ({
    sdkKey,
    read: vi.fn().mockResolvedValue({
      projectId: 'test',
      definitions: {},
      segments: {},
      environment: 'production',
    }),
    initialize: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
  })),
}));

import { FlagNetworkDataSource } from './data-source/flag-network-data-source';

function createMockCreateRawClient(): ReturnType<typeof createCreateRawClient> {
  return vi.fn().mockImplementation(({ dataSource }) => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
    getDatafile: vi.fn().mockResolvedValue({
      projectId: 'test',
      definitions: {},
      environment: 'production',
      metrics: { readMs: 0, source: 'in-memory', cacheStatus: 'HIT' },
    }),
    getFallbackDatafile: vi.fn().mockResolvedValue({
      projectId: 'test',
      definitions: {},
      environment: 'production',
      configUpdatedAt: 1,
      digest: 'a',
      revision: 1,
    }),
    evaluate: vi.fn().mockResolvedValue({ value: true, reason: 'static' }),
    _dataSource: dataSource, // For testing inspection
  }));
}

describe('make', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.FLAGS;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('createClient', () => {
    it('should create a client with a valid SDK key', () => {
      const createRawClient = createMockCreateRawClient();
      const { createClient } = make(createRawClient);

      const client = createClient('vf_test_key');

      expect(FlagNetworkDataSource).toHaveBeenCalledWith({
        sdkKey: 'vf_test_key',
      });
      expect(createRawClient).toHaveBeenCalled();
      expect(client).toBeDefined();
    });

    it('should create a client from a connection string', () => {
      const createRawClient = createMockCreateRawClient();
      const { createClient } = make(createRawClient);

      const connectionString =
        'flags:edgeConfigId=ecfg_123&edgeConfigToken=token&sdkKey=vf_conn_key';
      const client = createClient(connectionString);

      expect(FlagNetworkDataSource).toHaveBeenCalledWith({
        sdkKey: 'vf_conn_key',
      });
      expect(client).toBeDefined();
    });

    it('should throw for empty SDK key', () => {
      const createRawClient = createMockCreateRawClient();
      const { createClient } = make(createRawClient);

      expect(() => createClient('')).toThrow('flags: Missing sdkKey');
    });

    it('should throw for invalid connection string', () => {
      const createRawClient = createMockCreateRawClient();
      const { createClient } = make(createRawClient);

      expect(() => createClient('invalid_string')).toThrow(
        'flags: Missing sdkKey',
      );
    });

    it('should throw for connection string without sdkKey param', () => {
      const createRawClient = createMockCreateRawClient();
      const { createClient } = make(createRawClient);

      expect(() =>
        createClient('flags:edgeConfigId=ecfg_123&edgeConfigToken=token'),
      ).toThrow('flags: Missing sdkKey');
    });
  });

  describe('flagsClient proxy', () => {
    it('should not create client until property is accessed', () => {
      const createRawClient = createMockCreateRawClient();
      process.env.FLAGS = 'vf_test_key';

      const { flagsClient } = make(createRawClient);

      // Just getting flagsClient shouldn't create anything
      expect(createRawClient).not.toHaveBeenCalled();

      // Accessing a property should trigger creation
      const _ = flagsClient.evaluate;

      expect(createRawClient).toHaveBeenCalledTimes(1);
    });

    it('should throw if FLAGS env var is missing when accessed', () => {
      const createRawClient = createMockCreateRawClient();
      delete process.env.FLAGS;

      const { flagsClient } = make(createRawClient);

      expect(() => flagsClient.evaluate).toThrow(
        'flags: Missing environment variable FLAGS',
      );
    });

    it('should throw if FLAGS env var has invalid value', () => {
      const createRawClient = createMockCreateRawClient();
      process.env.FLAGS = 'invalid_value';

      const { flagsClient } = make(createRawClient);

      expect(() => flagsClient.evaluate).toThrow('flags: Missing sdkKey');
    });

    it('should cache the client after first access', () => {
      const createRawClient = createMockCreateRawClient();
      process.env.FLAGS = 'vf_test_key';

      const { flagsClient } = make(createRawClient);

      // Access multiple properties
      const _ = flagsClient.evaluate;
      const __ = flagsClient.initialize;
      const ___ = flagsClient.shutdown;

      // Should only create client once
      expect(createRawClient).toHaveBeenCalledTimes(1);
    });

    it('should use FLAGS env var to create default client', () => {
      const createRawClient = createMockCreateRawClient();
      process.env.FLAGS = 'vf_env_key';

      const { flagsClient } = make(createRawClient);
      const _ = flagsClient.evaluate;

      expect(FlagNetworkDataSource).toHaveBeenCalledWith({
        sdkKey: 'vf_env_key',
      });
    });

    it('should support FLAGS as connection string', () => {
      const createRawClient = createMockCreateRawClient();
      process.env.FLAGS =
        'flags:edgeConfigId=ecfg_123&edgeConfigToken=token&sdkKey=vf_flags_key';

      const { flagsClient } = make(createRawClient);
      const _ = flagsClient.evaluate;

      expect(FlagNetworkDataSource).toHaveBeenCalledWith({
        sdkKey: 'vf_flags_key',
      });
    });
  });

  describe('resetDefaultFlagsClient', () => {
    it('should clear the cached client', () => {
      const createRawClient = createMockCreateRawClient();
      process.env.FLAGS = 'vf_test_key';

      const { flagsClient, resetDefaultFlagsClient } = make(createRawClient);

      // Access to create client
      const _ = flagsClient.evaluate;
      expect(createRawClient).toHaveBeenCalledTimes(1);

      // Reset
      resetDefaultFlagsClient();

      // Access again should create new client
      const __ = flagsClient.initialize;
      expect(createRawClient).toHaveBeenCalledTimes(2);
    });

    it('should allow reconfiguration after reset', () => {
      const createRawClient = createMockCreateRawClient();
      process.env.FLAGS = 'vf_first_key';

      const { flagsClient, resetDefaultFlagsClient } = make(createRawClient);

      // Access with first key
      const _ = flagsClient.evaluate;
      expect(FlagNetworkDataSource).toHaveBeenCalledWith({
        sdkKey: 'vf_first_key',
      });

      // Reset and change env
      resetDefaultFlagsClient();
      process.env.FLAGS = 'vf_second_key';

      // Access again with new key
      const __ = flagsClient.initialize;
      expect(FlagNetworkDataSource).toHaveBeenCalledWith({
        sdkKey: 'vf_second_key',
      });
    });
  });

  describe('integration', () => {
    it('should return a working client that can call methods', async () => {
      const createRawClient = createMockCreateRawClient();
      const { createClient } = make(createRawClient);

      const client = createClient('vf_test_key');

      // All methods should be callable
      await expect(client.initialize()).resolves.toBeUndefined();
      await expect(client.evaluate('flag')).resolves.toEqual({
        value: true,
        reason: 'static',
      });
      await expect(client.getFallbackDatafile()).resolves.toEqual({
        projectId: 'test',
        definitions: {},
        environment: 'production',
        configUpdatedAt: 1,
        digest: 'a',
        revision: 1,
      });
      await expect(client.shutdown()).resolves.toBeUndefined();
    });
  });
});
