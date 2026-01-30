import { describe, expect, it } from 'vitest';
import { InMemoryDataSource } from './data-source/in-memory-data-source';
import { createRawClient } from './index.default';

describe('createRawClient', () => {
  it('should be a function', () => {
    expect(typeof createRawClient).toBe('function');
  });

  it('should allow a custom data source', async () => {
    const inlineDataSource = new InMemoryDataSource({
      data: { definitions: {}, segments: {} },
      projectId: 'test',
      environment: 'production',
    });
    const flagsClient = createRawClient({
      dataSource: inlineDataSource,
    });

    // Verify the custom data source is used by checking metadata
    await expect(flagsClient.getMetadata()).resolves.toEqual({
      projectId: 'test',
    });
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
