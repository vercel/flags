import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findConfigFile } from 'flags/tooling';
import type { NextConfig } from 'next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { withFlags } from './plugin';

function projectWith(file?: string) {
  const dir = mkdtempSync(join(tmpdir(), 'flags-next-'));
  if (file) {
    mkdirSync(join(dir, file, '..'), { recursive: true });
    writeFileSync(join(dir, file), 'export const config = {};');
  }
  return dir;
}

type WebpackFn = NonNullable<NextConfig['webpack']>;

describe('withFlags', () => {
  it('points flags/framework to the binding', () => {
    const config = withFlags<NextConfig>({}, { dir: projectWith() });

    expect(config.turbopack?.resolveAlias).toEqual({
      'flags/framework': '@flags-sdk/next/binding',
    });
  });

  it('points flags/config to flags.config.ts', () => {
    const dir = projectWith('flags.config.ts');
    const config = withFlags<NextConfig>({}, { dir });

    expect(config.turbopack?.resolveAlias).toMatchObject({
      'flags/config': './flags.config.ts',
    });
  });

  it('finds flags.config.ts in src', () => {
    const dir = projectWith('src/flags.config.ts');

    expect(findConfigFile(dir)).toBe(join(dir, 'src', 'flags.config.ts'));
    expect(
      withFlags<NextConfig>({}, { dir }).turbopack?.resolveAlias,
    ).toMatchObject({
      'flags/config': './src/flags.config.ts',
    });
  });

  it('keeps the configuration of the application', () => {
    const config = withFlags(
      {
        reactStrictMode: true,
        turbopack: {
          resolveAlias: { own: './own.js' },
          rules: { '*.svg': { loaders: ['@svgr/webpack'], as: '*.js' } },
        },
      },
      { dir: projectWith() },
    );

    expect(config.reactStrictMode).toBe(true);
    expect(config.turbopack?.resolveAlias).toEqual({
      own: './own.js',
      'flags/framework': '@flags-sdk/next/binding',
    });
    expect(config.turbopack?.rules?.['*.svg']).toEqual({
      loaders: ['@svgr/webpack'],
      as: '*.js',
    });
  });

  it('adds the loader for use flags modules to Turbopack', () => {
    const config = withFlags<NextConfig>({}, { dir: projectWith() });

    expect(config.turbopack?.rules?.['*.ts']).toEqual([
      {
        condition: { all: [{ not: 'foreign' }, { content: /use flags/ }] },
        loaders: ['@flags-sdk/next/use-flags-loader'],
      },
    ]);
  });

  it('throws for a build with webpack', () => {
    const config = withFlags<NextConfig>({}, { dir: projectWith() });

    expect(() => config.webpack?.({}, {} as Parameters<WebpackFn>[1])).toThrow(
      'flags: withFlags supports only Turbopack. Remove --webpack from next dev and next build.',
    );
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
    const first = secretOf(withFlags<NextConfig>({}, { dir: projectWith() }));
    // e.g. a worker of the build, which loads the configuration again
    const second = secretOf(withFlags<NextConfig>({}, { dir: projectWith() }));

    expect(first).toMatch(/^[\w-]{43}$/);
    expect(second).toBe(first);
    // Not in process.env with the name which the runtime reads
    expect(process.env.__FLAGS_PRECOMPUTE_BUILD_SECRET).toBeUndefined();
  });

  it('uses FLAGS_PRECOMPUTE_SECRET of the build', () => {
    vi.stubEnv('FLAGS_PRECOMPUTE_SECRET', 'from-the-build');

    expect(secretOf(withFlags<NextConfig>({}, { dir: projectWith() }))).toBe(
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

describe('Cache Components', () => {
  const defineOf = (config: NextConfig) =>
    config.compiler?.defineServer?.[
      'process.env.__FLAGS_NEXT_CACHE_COMPONENTS'
    ];

  it('tells the server code whether Cache Components are enabled', () => {
    const dir = projectWith();

    expect(defineOf(withFlags<NextConfig>({}, { dir }))).toBe('false');
    expect(
      defineOf(withFlags<NextConfig>({ cacheComponents: true }, { dir })),
    ).toBe('true');
    // The name of Next.js 15
    expect(
      defineOf(
        withFlags({ experimental: { dynamicIO: true } } as NextConfig, { dir }),
      ),
    ).toBe('true');
  });
});
