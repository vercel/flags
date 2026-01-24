import { describe, expect, it } from 'vitest';
import { createRawClient, getDefaultFlagsClient } from '.';

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

describe('getDefaultFlagsClient', () => {
  it('works', () => {
    process.env.FLAGS = 'vf_server_testkey';
    process.env.VERCEL_ENV = 'development';
    const client = getDefaultFlagsClient();
    expect(client).toBeDefined();
    expect(client.dataSource).toBeDefined();
    delete process.env.VERCEL_ENV;
  });
});
