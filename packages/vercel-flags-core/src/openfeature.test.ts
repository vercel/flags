import { describe, expect, it } from 'vitest';
import { createClient } from './client';
import { InMemoryDataSource } from './data-source/in-memory-data-source';
import { VercelProvider } from './openfeature';
import { type Packed, ResolutionReason } from './types';

describe('VercelProvider', () => {
  describe('constructor', () => {
    it('should accept a FlagsClient', () => {
      const dataSource = new InMemoryDataSource({
        definitions: {},
        segments: {},
      });
      const client = createClient({
        dataSource,
        environment: 'production',
      });
      const provider = new VercelProvider(client);

      expect(provider.metadata.name).toBe('vercel-nodejs-provider');
      expect(provider.runsOn).toBe('server');
    });

    it('should accept a connection string', () => {
      const connectionString =
        'flags:edgeConfigId=test&edgeConfigToken=test&projectId=test';
      const provider = new VercelProvider(connectionString);

      expect(provider.metadata.name).toBe('vercel-nodejs-provider');
      expect(provider.runsOn).toBe('server');
    });
  });

  describe('resolveBooleanEvaluation', () => {
    it('should resolve a boolean flag', async () => {
      const dataSource = new InMemoryDataSource({
        definitions: {
          'boolean-flag': {
            environments: { production: 0 },
            variants: [true],
          } as Packed.FlagDefinition,
        },
        segments: {},
      });
      const client = createClient({
        dataSource,
        environment: 'production',
      });
      const provider = new VercelProvider(client);

      const result = await provider.resolveBooleanEvaluation(
        'boolean-flag',
        false,
        {},
      );

      expect(result.value).toBe(true);
      expect(result.reason).toBe(ResolutionReason.PAUSED);
    });

    it('should return default value when flag is not found', async () => {
      const dataSource = new InMemoryDataSource({
        definitions: {},
        segments: {},
      });
      const client = createClient({
        dataSource,
        environment: 'production',
      });
      const provider = new VercelProvider(client);

      const result = await provider.resolveBooleanEvaluation(
        'nonexistent-flag',
        false,
        {},
      );

      expect(result.value).toBe(false);
      expect(result.reason).toBe(ResolutionReason.ERROR);
      expect(result.errorMessage).toContain('Definition not found');
    });

    it('should use fallthrough outcome for active flags', async () => {
      const dataSource = new InMemoryDataSource({
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
      });
      const client = createClient({
        dataSource,
        environment: 'production',
      });
      const provider = new VercelProvider(client);

      const result = await provider.resolveBooleanEvaluation(
        'active-flag',
        false,
        {},
      );

      expect(result.value).toBe(true);
      expect(result.reason).toBe(ResolutionReason.FALLTHROUGH);
    });
  });

  describe('resolveStringEvaluation', () => {
    it('should resolve a string flag', async () => {
      const dataSource = new InMemoryDataSource({
        definitions: {
          'string-flag': {
            environments: { production: 0 },
            variants: ['variant-a'],
          } as Packed.FlagDefinition,
        },
        segments: {},
      });
      const client = createClient({
        dataSource,
        environment: 'production',
      });
      const provider = new VercelProvider(client);

      const result = await provider.resolveStringEvaluation(
        'string-flag',
        'default',
        {},
      );

      expect(result.value).toBe('variant-a');
      expect(result.reason).toBe(ResolutionReason.PAUSED);
    });

    it('should return default value when flag is not found', async () => {
      const dataSource = new InMemoryDataSource({
        definitions: {},
        segments: {},
      });
      const client = createClient({
        dataSource,
        environment: 'production',
      });
      const provider = new VercelProvider(client);

      const result = await provider.resolveStringEvaluation(
        'nonexistent-flag',
        'default',
        {},
      );

      expect(result.value).toBe('default');
      expect(result.reason).toBe(ResolutionReason.ERROR);
      expect(result.errorMessage).toContain('Definition not found');
    });
  });

  describe('resolveNumberEvaluation', () => {
    it('should resolve a number flag', async () => {
      const dataSource = new InMemoryDataSource({
        definitions: {
          'number-flag': {
            environments: { production: 0 },
            variants: [42],
          } as Packed.FlagDefinition,
        },
        segments: {},
      });
      const client = createClient({
        dataSource,
        environment: 'production',
      });
      const provider = new VercelProvider(client);

      const result = await provider.resolveNumberEvaluation(
        'number-flag',
        0,
        {},
      );

      expect(result.value).toBe(42);
      expect(result.reason).toBe(ResolutionReason.PAUSED);
    });

    it('should return default value when flag is not found', async () => {
      const dataSource = new InMemoryDataSource({
        definitions: {},
        segments: {},
      });
      const client = createClient({
        dataSource,
        environment: 'production',
      });
      const provider = new VercelProvider(client);

      const result = await provider.resolveNumberEvaluation(
        'nonexistent-flag',
        100,
        {},
      );

      expect(result.value).toBe(100);
      expect(result.reason).toBe(ResolutionReason.ERROR);
      expect(result.errorMessage).toContain('Definition not found');
    });
  });

  describe('resolveObjectEvaluation', () => {
    it('should resolve an object flag', async () => {
      const dataSource = new InMemoryDataSource({
        definitions: {
          'object-flag': {
            environments: { production: 0 },
            variants: ['value'],
          } as Packed.FlagDefinition,
        },
        segments: {},
      });
      const client = createClient({
        dataSource,
        environment: 'production',
      });
      const provider = new VercelProvider(client);

      const result = await provider.resolveObjectEvaluation(
        'object-flag',
        {},
        {},
      );

      expect(result.value).toEqual('value');
      expect(result.reason).toBe(ResolutionReason.PAUSED);
    });

    it('should return default value when flag is not found', async () => {
      const dataSource = new InMemoryDataSource({
        definitions: {},
        segments: {},
      });
      const client = createClient({
        dataSource,
        environment: 'production',
      });
      const provider = new VercelProvider(client);

      const result = await provider.resolveObjectEvaluation(
        'nonexistent-flag',
        { default: true },
        {},
      );

      expect(result.value).toEqual({ default: true });
      expect(result.reason).toBe(ResolutionReason.ERROR);
      expect(result.errorMessage).toContain('Definition not found');
    });
  });

  describe('initialize', () => {
    it('should initialize without errors', async () => {
      const dataSource = new InMemoryDataSource({
        definitions: {},
        segments: {},
      });
      const client = createClient({
        dataSource,
        environment: 'production',
      });
      const provider = new VercelProvider(client);

      await expect(provider.initialize()).resolves.toBeUndefined();
    });
  });

  describe('onClose', () => {
    it('should close without errors', async () => {
      const dataSource = new InMemoryDataSource({
        definitions: {},
        segments: {},
      });
      const client = createClient({
        dataSource,
        environment: 'production',
      });
      const provider = new VercelProvider(client);

      await expect(provider.onClose()).resolves.toBeUndefined();
    });
  });

  describe('context passing', () => {
    it('should pass evaluation context to the client', async () => {
      const dataSource = new InMemoryDataSource({
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
      });
      const client = createClient({
        dataSource,
        environment: 'production',
      });
      const provider = new VercelProvider(client);

      const result = await provider.resolveStringEvaluation(
        'context-flag',
        'default',
        { user: { id: 'user-123' } },
      );

      expect(result.value).toBe('variant-b');
      expect(result.reason).toBe(ResolutionReason.TARGET_MATCH);
    });
  });
});
