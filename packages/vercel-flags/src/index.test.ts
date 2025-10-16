import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  getDefaultFlagsClient,
  getFlagsEnvironment,
  parseFlagsConnectionString,
} from '.';

describe('getDefaultFlagsClient', () => {
  it('works', () => {
    process.env.FLAGS =
      'someProjectId:unused:edgeConfigId=ecfg_fakeEdgeConfigId&edgeConfigItemKey=fake-item-key&edgeConfigToken=fake';
    process.env.VERCEL_ENV = 'development';
    expect(getDefaultFlagsClient().environment).toEqual('development');
    delete process.env.VERCEL_ENV;
  });
});

describe('parseFlagsConnectionString', () => {
  it('should parse deprecated connection strings', () => {
    expect(
      parseFlagsConnectionString(
        'prj_xxx:readonlyToken:edgeConfigId=a&edgeConfigToken=b&edgeConfigItemKey=c',
      ),
    ).toEqual({
      edgeConfigId: 'a',
      edgeConfigToken: 'b',
      edgeConfigItemKey: 'c',
      projectId: 'prj_xxx',
      env: null,
    });
  });

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
