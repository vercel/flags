import { describe, expect, it } from 'vitest';
import { createRawClient, flagsClient } from './index.default';

describe('createRawClient', () => {
  it('should allow creating a client', () => {
    const client = createRawClient({
      dataSource: {
        async getData() {
          return {
            definitions: {},
            segments: {},
            projectId: 'test',
            environment: 'production',
          };
        },
        async getMetadata() {
          return { projectId: 'test' };
        },
      },
    });
    expect(client).toBeDefined();
  });
});

describe('flagsClient', () => {
  it('works', () => {
    process.env.FLAGS = 'vf_server_testkey';
    process.env.VERCEL_ENV = 'development';
    expect(flagsClient).toBeDefined();
    expect(flagsClient.dataSource).toBeDefined();
    delete process.env.VERCEL_ENV;
  });
});
