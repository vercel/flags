import { describe, expect, it } from 'vitest';
import { createClient, type DataSource } from './client';
import type { Packed } from './types';

class CustomDataSource implements DataSource {
  private data: Partial<Packed.Data>;
  public projectId?: string | undefined;
  constructor(data: Partial<Packed.Data>, projectId?: string) {
    this.data = data;
    this.projectId = projectId;
  }
  async getData(): Promise<Packed.Data> {
    return this.data as Packed.Data;
  }
}

describe('createClient', () => {
  it('should be a function', () => {
    expect(typeof createClient).toBe('function');
  });

  it('should allow a custom data source', () => {
    const customDataSource = new CustomDataSource({});
    const flagsClient = createClient({
      dataSource: customDataSource,
      environment: 'production',
    });

    expect(flagsClient.environment).toEqual('production');
    expect(flagsClient.dataSource).toEqual(customDataSource);
  });

  it('should evaluate', async () => {
    const customDataSource = new CustomDataSource({
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
