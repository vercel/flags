import type { Client, EvaluationContext } from '@openfeature/server-sdk';
import type { ReadonlyHeaders, ReadonlyRequestCookies } from 'flags';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOpenFeatureAdapter } from './index';

describe('OpenFeature Adapter', () => {
  let mockClient: Client;
  let mockHeaders: Partial<ReadonlyHeaders>;
  let mockCookies: Partial<ReadonlyRequestCookies>;

  beforeEach(() => {
    mockClient = {
      getBooleanValue: vi.fn(),
      getStringValue: vi.fn(),
      getNumberValue: vi.fn(),
      getObjectValue: vi.fn(),
    } as unknown as Client;

    mockHeaders = { get: vi.fn() };
    mockCookies = { get: vi.fn() };
  });

  describe('sync client', () => {
    describe('booleanValue', () => {
      it('should call getBooleanValue with correct parameters', async () => {
        const adapter = createOpenFeatureAdapter(mockClient);
        const key = 'test-flag';
        const defaultValue = false;
        const entities: EvaluationContext = { targetingKey: 'user-1' };
        const options = { hookHints: { test: true } };

        vi.mocked(mockClient.getBooleanValue).mockResolvedValue(true);

        const result = await adapter.booleanValue(options).decide({
          key,
          defaultValue,
          entities,
          headers: mockHeaders as ReadonlyHeaders,
          cookies: mockCookies as ReadonlyRequestCookies,
        });

        expect(mockClient.getBooleanValue).toHaveBeenCalledWith(
          key,
          defaultValue,
          entities,
          options,
        );
        expect(result).toBe(true);
      });
    });

    describe('stringValue', () => {
      it('should call getStringValue with correct parameters', async () => {
        const adapter = createOpenFeatureAdapter(mockClient);
        const key = 'test-flag';
        const defaultValue = 'default';
        const entities: EvaluationContext = { targetingKey: 'user-1' };
        const options = { hookHints: { test: true } };

        vi.mocked(mockClient.getStringValue).mockResolvedValue('test-value');

        const result = await adapter.stringValue(options).decide({
          key,
          defaultValue,
          entities,
          headers: mockHeaders as ReadonlyHeaders,
          cookies: mockCookies as ReadonlyRequestCookies,
        });

        expect(mockClient.getStringValue).toHaveBeenCalledWith(
          key,
          defaultValue,
          entities,
          options,
        );
        expect(result).toBe('test-value');
      });
    });

    describe('numberValue', () => {
      it('should call getNumberValue with correct parameters', async () => {
        const adapter = createOpenFeatureAdapter(mockClient);
        const key = 'test-flag';
        const defaultValue = 42;
        const entities: EvaluationContext = { targetingKey: 'user-1' };
        const options = { hookHints: { test: true } };

        vi.mocked(mockClient.getNumberValue).mockResolvedValue(100);

        const result = await adapter.numberValue(options).decide({
          key,
          defaultValue,
          entities,
          headers: mockHeaders as ReadonlyHeaders,
          cookies: mockCookies as ReadonlyRequestCookies,
        });

        expect(mockClient.getNumberValue).toHaveBeenCalledWith(
          key,
          defaultValue,
          entities,
          options,
        );
        expect(result).toBe(100);
      });
    });

    describe('objectValue', () => {
      it('should call getObjectValue with correct parameters', async () => {
        const adapter = createOpenFeatureAdapter(mockClient);
        const key = 'test-flag';
        const defaultValue = { test: true };
        const entities: EvaluationContext = { targetingKey: 'user-1' };
        const options = { hookHints: { test: true } };

        vi.mocked(mockClient.getObjectValue).mockResolvedValue({ test: false });

        const result = await adapter.objectValue(options).decide({
          key,
          defaultValue,
          entities,
          headers: mockHeaders as ReadonlyHeaders,
          cookies: mockCookies as ReadonlyRequestCookies,
        });

        expect(mockClient.getObjectValue).toHaveBeenCalledWith(
          key,
          defaultValue,
          entities,
          options,
        );
        expect(result).toEqual({ test: false });
      });
    });

    describe('client', () => {
      it('should expose the client instance', () => {
        const adapter = createOpenFeatureAdapter(mockClient);
        expect(adapter.client).toBe(mockClient);
      });
    });
  });

  describe('async client', () => {
    describe('booleanValue', () => {
      it('should call getBooleanValue with correct parameters', async () => {
        const adapter = createOpenFeatureAdapter(async () => mockClient);
        const key = 'test-flag';
        const defaultValue = false;
        const entities: EvaluationContext = { targetingKey: 'user-1' };
        const options = { hookHints: { test: true } };

        vi.mocked(mockClient.getBooleanValue).mockResolvedValue(true);

        const result = await adapter.booleanValue(options).decide({
          key,
          defaultValue,
          entities,
          headers: mockHeaders as ReadonlyHeaders,
          cookies: mockCookies as ReadonlyRequestCookies,
        });

        expect(mockClient.getBooleanValue).toHaveBeenCalledWith(
          key,
          defaultValue,
          entities,
          options,
        );
        expect(result).toBe(true);
      });
    });

    describe('stringValue', () => {
      it('should call getStringValue with correct parameters', async () => {
        const adapter = createOpenFeatureAdapter(async () => mockClient);
        const key = 'test-flag';
        const defaultValue = 'default';
        const entities: EvaluationContext = { targetingKey: 'user-1' };
        const options = { hookHints: { test: true } };

        vi.mocked(mockClient.getStringValue).mockResolvedValue('test-value');

        const result = await adapter.stringValue(options).decide({
          key,
          defaultValue,
          entities,
          headers: mockHeaders as ReadonlyHeaders,
          cookies: mockCookies as ReadonlyRequestCookies,
        });

        expect(mockClient.getStringValue).toHaveBeenCalledWith(
          key,
          defaultValue,
          entities,
          options,
        );
        expect(result).toBe('test-value');
      });
    });

    describe('numberValue', () => {
      it('should call getNumberValue with correct parameters', async () => {
        const adapter = createOpenFeatureAdapter(async () => mockClient);
        const key = 'test-flag';
        const defaultValue = 42;
        const entities: EvaluationContext = { targetingKey: 'user-1' };
        const options = { hookHints: { test: true } };

        vi.mocked(mockClient.getNumberValue).mockResolvedValue(100);

        const result = await adapter.numberValue(options).decide({
          key,
          defaultValue,
          entities,
          headers: mockHeaders as ReadonlyHeaders,
          cookies: mockCookies as ReadonlyRequestCookies,
        });

        expect(mockClient.getNumberValue).toHaveBeenCalledWith(
          key,
          defaultValue,
          entities,
          options,
        );
        expect(result).toBe(100);
      });
    });

    describe('objectValue', () => {
      it('should call getObjectValue with correct parameters', async () => {
        const adapter = createOpenFeatureAdapter(async () => mockClient);
        const key = 'test-flag';
        const defaultValue = { test: true };
        const entities: EvaluationContext = { targetingKey: 'user-1' };
        const options = { hookHints: { test: true } };

        vi.mocked(mockClient.getObjectValue).mockResolvedValue({ test: false });

        const result = await adapter.objectValue(options).decide({
          key,
          defaultValue,
          entities,
          headers: mockHeaders as ReadonlyHeaders,
          cookies: mockCookies as ReadonlyRequestCookies,
        });

        expect(mockClient.getObjectValue).toHaveBeenCalledWith(
          key,
          defaultValue,
          entities,
          options,
        );
        expect(result).toEqual({ test: false });
      });
    });

    it('should expose the client instance', async () => {
      const adapter = createOpenFeatureAdapter(async () => mockClient);
      await expect(adapter.client()).resolves.toBe(mockClient);
    });

    it('should retry initialization after a failed attempt', async () => {
      const initFn = vi
        .fn<() => Promise<Client>>()
        .mockRejectedValueOnce(new Error('transient connect failure'))
        .mockResolvedValue(mockClient);
      const adapter = createOpenFeatureAdapter(initFn);
      const boolean = adapter.booleanValue();
      const decideOptions = {
        key: 'test-flag',
        defaultValue: false,
        entities: {},
        headers: mockHeaders as ReadonlyHeaders,
        cookies: mockCookies as ReadonlyRequestCookies,
      };

      await expect(boolean.decide(decideOptions)).rejects.toThrow(
        'transient connect failure',
      );

      vi.mocked(mockClient.getBooleanValue).mockResolvedValue(true);
      await expect(boolean.decide(decideOptions)).resolves.toBe(true);
      expect(initFn).toHaveBeenCalledTimes(2);
    });

    it('should not retry initialization after a fatal error', async () => {
      const fatalError = Object.assign(new Error('invalid credentials'), {
        code: 'PROVIDER_FATAL',
      });
      const initFn = vi
        .fn<() => Promise<Client>>()
        .mockRejectedValue(fatalError);
      const adapter = createOpenFeatureAdapter(initFn);

      await expect(adapter.client()).rejects.toThrow('invalid credentials');
      await expect(adapter.client()).rejects.toThrow('invalid credentials');
      expect(initFn).toHaveBeenCalledTimes(1);
    });

    it('should share a single failed attempt across concurrent callers', async () => {
      const delay = (ms: number) =>
        new Promise((resolve) => setTimeout(resolve, ms));
      const initFn = vi.fn<() => Promise<Client>>(async () => {
        await delay(5);
        throw new Error('transient connect failure');
      });
      const adapter = createOpenFeatureAdapter(initFn);

      const results = await Promise.allSettled([
        adapter.client(),
        adapter.client(),
      ]);

      expect(results.map((result) => result.status)).toEqual([
        'rejected',
        'rejected',
      ]);
      expect(initFn).toHaveBeenCalledTimes(1);
    });

    it('should only initialize the client once', async () => {
      const delay = (ms: number) =>
        new Promise((resolve) => setTimeout(resolve, ms));
      const initFn = vi.fn(async () => {
        await delay(5);
        return mockClient;
      });
      const adapter = createOpenFeatureAdapter(initFn);
      const [client1, client2] = await Promise.all([
        adapter.client(),
        adapter.client(),
      ]);
      expect(initFn).toHaveBeenCalledTimes(1);
      expect(client1).toBe(client2);
    });
  });
});
