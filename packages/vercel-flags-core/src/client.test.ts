import { describe, expect, it } from 'vitest';
import { createRawClient } from './client';
import { InMemoryDataSource } from './data-source/in-memory-data-source';

describe('createRawClient', () => {
  it('should be a function', () => {
    expect(typeof createRawClient).toBe('function');
  });

  it('should allow a custom data source', () => {
    const inlineDataSource = new InMemoryDataSource({
      data: { definitions: {}, segments: {} },
      projectId: 'test',
      environment: 'production',
    });
    const flagsClient = createRawClient({
      dataSource: inlineDataSource,
    });

    expect(flagsClient.dataSource).toEqual(inlineDataSource);
  });

  it('should evaluate', async () => {
    const customDataSource = new InMemoryDataSource({
      data: {
        definitions: {
          'summer-sale': { environments: { production: 0 }, variants: [false] },
        },
        segments: {},
      },
      projectId: 'test',
      environment: 'production',
    });
    const flagsClient = createRawClient({
      dataSource: customDataSource,
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
