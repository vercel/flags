import { describe, expect, it } from 'vitest';
import * as defaultExports from './index.default';
import * as nextJsExports from './index.next-js';

const { flagsClient } = defaultExports;

describe('index exports equivalence', () => {
  it('should have equivalent exports between index.default.ts and index.next-js.ts', () => {
    const defaultKeys = Object.keys(defaultExports).sort();
    const nextJsKeys = Object.keys(nextJsExports).sort();

    // next-js exports cachedFns which default doesn't have
    const nextJsKeysWithoutCachedFns = nextJsKeys.filter(
      (key) => key !== 'cachedFns',
    );

    expect(nextJsKeysWithoutCachedFns).toEqual(defaultKeys);
  });
});

describe('flagsClient', () => {
  it('works', () => {
    process.env.FLAGS = 'vf_server_testkey';
    process.env.VERCEL_ENV = 'development';
    expect(flagsClient).toBeDefined();
    delete process.env.VERCEL_ENV;
  });
});
