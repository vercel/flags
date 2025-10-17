import { describe, expect, it } from 'vitest';
import { createClient, type DataSource } from './client';
import type { ConnectionOptions, Packed } from './types';

class CustomDataSource implements DataSource {
  private data: Partial<Packed.Data>;
  constructor(data: Partial<Packed.Data>) {
    this.data = data;
  }
  async getData(): Promise<Packed.Data> {
    return this.data as Packed.Data;
  }
}

const connectionOptions: ConnectionOptions = {
  edgeConfigId: 'fake-edge-config-id',
  projectId: 'fake-project-id',
  edgeConfigToken: 'fake-edge-config-token',
  env: null,
  edgeConfigItemKey: null,
};

describe('createClient', () => {
  it('should be a function', () => {
    expect(typeof createClient).toBe('function');
  });

  it('should allow a custom data source', () => {
    const customDataSource = new CustomDataSource({});
    const flagsClient = createClient({
      dataSource: customDataSource,
      environment: 'production',
      connectionOptions,
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
      connectionOptions,
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
