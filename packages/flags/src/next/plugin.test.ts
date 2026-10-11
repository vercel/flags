import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NextConfig } from 'next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { findConfigFile, withFlags } from './plugin';

function projectWith(file?: string) {
  const dir = mkdtempSync(join(tmpdir(), 'flags-next-'));
  if (file) {
    mkdirSync(join(dir, file, '..'), { recursive: true });
    writeFileSync(join(dir, file), 'export const config = {};');
  }
  return dir;
}

type WebpackFn = NonNullable<NextConfig['webpack']>;
type WebpackConfig = Parameters<WebpackFn>[0];

function runWebpack(config: NextConfig, initial: WebpackConfig = {}) {
  return config.webpack?.(initial, {} as Parameters<WebpackFn>[1]);
}

describe('withFlags', () => {
  it('points flags/integration to flags/next', () => {
    const config = withFlags({}, { dir: projectWith() });

    expect(config.turbopack?.resolveAlias).toEqual({
      'flags/integration': 'flags/next',
    });
    expect(runWebpack(config).resolve.alias).toEqual({
      'flags/integration$': 'flags/next',
    });
  });

  it('points flags/config to flags.config.ts', () => {
    const dir = projectWith('flags.config.ts');
    const config = withFlags({}, { dir });

    expect(config.turbopack?.resolveAlias).toMatchObject({
      'flags/config': './flags.config.ts',
    });
    expect(runWebpack(config).resolve.alias).toMatchObject({
      'flags/config$': join(dir, 'flags.config.ts'),
    });
  });

  it('finds flags.config.ts in src', () => {
    const dir = projectWith('src/flags.config.ts');

    expect(findConfigFile(dir)).toBe(join(dir, 'src', 'flags.config.ts'));
    expect(withFlags({}, { dir }).turbopack?.resolveAlias).toMatchObject({
      'flags/config': './src/flags.config.ts',
    });
  });

  it('keeps the configuration of the application', () => {
    const own = vi.fn((config: WebpackConfig) => {
      config.resolve = { alias: { own: './own.js' } };
      return config;
    });
    const config = withFlags(
      {
        reactStrictMode: true,
        turbopack: { resolveAlias: { own: './own.js' } },
        webpack: own,
      },
      { dir: projectWith() },
    );

    expect(config.reactStrictMode).toBe(true);
    expect(config.turbopack?.resolveAlias).toEqual({
      own: './own.js',
      'flags/integration': 'flags/next',
    });
    expect(runWebpack(config).resolve.alias).toEqual({
      own: './own.js',
      'flags/integration$': 'flags/next',
    });
    expect(own).toHaveBeenCalledTimes(1);
  });
});

describe('the secret of precompute for the build', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const secretOf = (config: NextConfig) =>
    config.compiler?.defineServer?.[
      'process.env.__FLAGS_PRECOMPUTE_BUILD_SECRET'
    ];

  it('puts one random key into the server code for the whole build', () => {
    vi.stubEnv('FLAGS_PRECOMPUTE_SECRET', '');
    vi.stubEnv('__FLAGS_PRECOMPUTE_BUILD_KEY', undefined);
    const first = secretOf(withFlags({}, { dir: projectWith() }));
    // e.g. a worker of the build, which loads the configuration again
    const second = secretOf(withFlags({}, { dir: projectWith() }));

    expect(first).toMatch(/^[\w-]{43}$/);
    expect(second).toBe(first);
    // Not in process.env with the name which the runtime reads
    expect(process.env.__FLAGS_PRECOMPUTE_BUILD_SECRET).toBeUndefined();
  });

  it('uses FLAGS_PRECOMPUTE_SECRET of the build', () => {
    vi.stubEnv('FLAGS_PRECOMPUTE_SECRET', 'from-the-build');

    expect(secretOf(withFlags({}, { dir: projectWith() }))).toBe(
      'from-the-build',
    );
  });

  it('keeps the defines of the configuration', () => {
    const config = withFlags(
      { compiler: { defineServer: { OWN: 'value' } } },
      { dir: projectWith() },
    );

    expect(config.compiler?.defineServer).toMatchObject({ OWN: 'value' });
  });
});
