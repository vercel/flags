import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  createRawClient,
  getDefaultFlagsClient,
  getFlagsEnvironment,
  parseFlagsConnectionString,
} from '.';

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
    process.env.FLAGS = 'flags:sdkKey=flgk_test123&projectId=someProjectId';
    process.env.VERCEL_ENV = 'development';
    const client = getDefaultFlagsClient();
    expect(client).toBeDefined();
    expect(client.dataSource).toBeDefined();
    delete process.env.VERCEL_ENV;
  });
});

describe('parseFlagsConnectionString', () => {
  it('should parse connection strings', () => {
    expect(
      parseFlagsConnectionString(
        'flags:edgeConfigId=a&edgeConfigToken=b&edgeConfigItemKey=c&projectId=d&env=production',
      ),
    ).toEqual({
      edgeConfigId: 'a',
      edgeConfigToken: 'b',
      edgeConfigItemKey: 'c',
      projectId: 'd',
      env: 'production',
    });
  });
});

describe('getFlagsEnvironment', () => {
  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it('should return the environment from connection options', () => {
    expect(getFlagsEnvironment('production')).toEqual('production');
  });

  it('should return the environment from VERCEL_ENV', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(getFlagsEnvironment(null)).toEqual('production');
  });

  it('should return "preview" for unknown VERCEL_ENV', () => {
    vi.stubEnv('VERCEL_ENV', 'unknown');
    expect(getFlagsEnvironment(null)).toEqual('preview');
  });

  it('should return "development" for undefined VERCEL_ENV', () => {
    vi.stubEnv('VERCEL_ENV', '');
    expect(getFlagsEnvironment(null)).toEqual('development');
  });
});
