import { describe, expect, it } from 'vitest';
import { createClient } from './client';
import { InMemoryDataSource } from './data-source/in-memory-data-source';

describe('createClient', () => {
  it('should be a function', () => {
    expect(typeof createClient).toBe('function');
  });

  it('should allow a custom data source', () => {
    const inlineDataSource = new InMemoryDataSource({ definitions: {} });
    const flagsClient = createClient({
      dataSource: inlineDataSource,
      environment: 'production',
    });

    expect(flagsClient.environment).toEqual('production');
    expect(flagsClient.dataSource).toEqual(inlineDataSource);
  });

  it('should evaluate', async () => {
    const customDataSource = new InMemoryDataSource({
      definitions: {
        'summer-sale': { environments: { production: 0 }, variants: [false] },
      },
    });
    const flagsClient = createClient({
      dataSource: customDataSource,
      environment: 'production',
    });

    await expect(
      flagsClient.evaluate('summer-sale', {
        entities: {},
        headers: new Headers(),
      }),
    ).resolves.toEqual({
      value: false,
      reason: 'paused',
      outcomeType: 'value',
    });
  });
});
