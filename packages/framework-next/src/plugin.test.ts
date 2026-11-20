import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
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
    const config = withFlags<NextConfig>(
      {},
      { dir: projectWith(), disableCodeGeneration: true },
    );

    expect(config.turbopack?.resolveAlias).toEqual({
      'flags/framework': '@flags-sdk/next/binding',
    });
  });

  it('points flags/config to flags/config.ts', () => {
    const dir = projectWith('flags/config.ts');
    const config = withFlags<NextConfig>(
      {},
      { dir, disableCodeGeneration: true },
    );

    expect(config.turbopack?.resolveAlias).toMatchObject({
      'flags/config': './flags/config.ts',
    });
  });

  it('finds flags/config.ts in src', () => {
    const dir = projectWith('src/flags/config.ts');

    expect(findConfigFile(dir)).toBe(join(dir, 'src', 'flags/config.ts'));
    expect(
      withFlags<NextConfig>({}, { dir, disableCodeGeneration: true }).turbopack
        ?.resolveAlias,
    ).toMatchObject({
      'flags/config': './src/flags/config.ts',
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
      { dir: projectWith(), disableCodeGeneration: true },
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
    const config = withFlags<NextConfig>(
      {},
      { dir: projectWith(), disableCodeGeneration: true },
    );

    expect(config.turbopack?.rules?.['*.ts']).toEqual([
      {
        condition: { all: [{ not: 'foreign' }, { content: /use flags/ }] },
        loaders: ['@flags-sdk/next/use-flags-loader'],
      },
    ]);
  });

  it('throws for a build with webpack', () => {
    const config = withFlags<NextConfig>(
      {},
      { dir: projectWith(), disableCodeGeneration: true },
    );

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
    const first = secretOf(
      withFlags<NextConfig>(
        {},
        { dir: projectWith(), disableCodeGeneration: true },
      ),
    );
    // e.g. a worker of the build, which loads the configuration again
    const second = secretOf(
      withFlags<NextConfig>(
        {},
        { dir: projectWith(), disableCodeGeneration: true },
      ),
    );

    expect(first).toMatch(/^[\w-]{43}$/);
    expect(second).toBe(first);
    // Not in process.env with the name which the runtime reads
    expect(process.env.__FLAGS_PRECOMPUTE_BUILD_SECRET).toBeUndefined();
  });

  it('uses FLAGS_PRECOMPUTE_SECRET of the build', () => {
    vi.stubEnv('FLAGS_PRECOMPUTE_SECRET', 'from-the-build');

    expect(
      secretOf(
        withFlags<NextConfig>(
          {},
          { dir: projectWith(), disableCodeGeneration: true },
        ),
      ),
    ).toBe('from-the-build');
  });

  it('keeps the defines of the configuration', () => {
    const config = withFlags(
      { compiler: { defineServer: { OWN: 'value' } } },
      { dir: projectWith(), disableCodeGeneration: true },
    );

    expect(config.compiler?.defineServer).toMatchObject({ OWN: 'value' });
  });
});

describe('Cache Components', () => {
  const aliasOf = (config: NextConfig) =>
    (config.turbopack?.resolveAlias as Record<string, string> | undefined)?.[
      '@flags-sdk/next/encrypt-values'
    ];

  it('lets FlagValues encrypt in use cache only with Cache Components', () => {
    const dir = projectWith();

    expect(
      aliasOf(withFlags<NextConfig>({}, { dir, disableCodeGeneration: true })),
    ).toBeUndefined();
    expect(
      aliasOf(
        withFlags<NextConfig>(
          { cacheComponents: true },
          { dir, disableCodeGeneration: true },
        ),
      ),
    ).toBe('@flags-sdk/next/encrypt-values-cached');
    // The name of Next.js 15
    expect(
      aliasOf(
        withFlags({ experimental: { dynamicIO: true } } as NextConfig, {
          dir,
          disableCodeGeneration: true,
        }),
      ),
    ).toBe('@flags-sdk/next/encrypt-values-cached');
  });

  it('lets precompute check its code in use cache only with Cache Components', () => {
    const dir = projectWith();
    const verifyAlias = (config: NextConfig) =>
      (config.turbopack?.resolveAlias as Record<string, string> | undefined)?.[
        '@flags-sdk/next/verify-code'
      ];

    expect(
      verifyAlias(
        withFlags<NextConfig>({}, { dir, disableCodeGeneration: true }),
      ),
    ).toBeUndefined();
    expect(
      verifyAlias(
        withFlags<NextConfig>(
          { cacheComponents: true },
          { dir, disableCodeGeneration: true },
        ),
      ),
    ).toBe('@flags-sdk/next/verify-code-cached');
  });
});

describe('code generation of flags:<source>', () => {
  function projectWithSource() {
    const dir = projectWith();
    const source = join(dir, 'flags/sources/shop');
    mkdirSync(source, { recursive: true });
    writeFileSync(
      join(source, 'catalog.ts'),
      "export default () => ({ flags: { 'summer-sale': { variants: [false, true] } } });",
    );
    // The generation must not run them
    writeFileSync(join(source, 'provider.ts'), "throw new Error('no');");
    writeFileSync(join(source, 'context.ts'), "throw new Error('no');");
    return dir;
  }

  it('points flags:<source> to the modules of .flags/aliases.json', () => {
    const dir = projectWith();
    mkdirSync(join(dir, '.flags'));
    writeFileSync(
      join(dir, '.flags/aliases.json'),
      JSON.stringify({ 'flags:shop': './.flags/shop.ts' }),
    );

    expect(
      withFlags<NextConfig>({}, { dir, disableCodeGeneration: true }).turbopack
        ?.resolveAlias,
    ).toMatchObject({ 'flags:shop': './.flags/shop.ts' });
  });

  it('generates the modules for next build, then adds the aliases', async () => {
    const dir = projectWithSource();
    const config = withFlags<NextConfig>({}, { dir });

    expect(typeof config).toBe('function');
    const resolved = await config('phase-production-build');

    expect(resolved.turbopack?.resolveAlias).toMatchObject({
      'flags:shop': './.flags/shop.ts',
      'flags/framework': '@flags-sdk/next/binding',
    });
    expect(readFileSync(join(dir, '.flags/shop.ts'), 'utf8')).toContain(
      'key: "summer-sale"',
    );
    // The types of flags:shop, without paths in tsconfig.json
    expect(readFileSync(join(dir, 'flags/generated.d.ts'), 'utf8')).toContain(
      "declare module 'flags:shop'",
    );
  });

  it('writes nothing for an app without flags/sources', async () => {
    const dir = projectWith();
    const config = withFlags<NextConfig>({}, { dir });

    await config('phase-production-build');

    expect(existsSync(join(dir, '.flags'))).toBe(false);
    expect(existsSync(join(dir, 'flags'))).toBe(false);
  });

  it('does no catalog work for next start', async () => {
    const dir = projectWithSource();
    const config = withFlags<NextConfig>({}, { dir });

    const resolved = await config('phase-production-server');

    expect(existsSync(join(dir, '.flags'))).toBe(false);
    expect(resolved.turbopack?.resolveAlias).toEqual({
      'flags/framework': '@flags-sdk/next/binding',
    });
  });

  it('takes a configuration function of the phase', async () => {
    const dir = projectWithSource();
    const config = withFlags<NextConfig>(
      async (phase) => ({
        distDir: phase === 'phase-production-build' ? 'out' : '.next',
      }),
      { dir },
    );

    const resolved = await config('phase-production-build');

    expect(resolved.distDir).toBe('out');
    expect(resolved.turbopack?.resolveAlias).toMatchObject({
      'flags:shop': './.flags/shop.ts',
    });
  });

  it('takes a configuration function without the code generation', async () => {
    const dir = projectWithSource();
    const config = withFlags<NextConfig>(() => ({ distDir: 'out' }), {
      dir,
      disableCodeGeneration: true,
    });

    const resolved = await config('phase-production-build');

    expect(resolved.distDir).toBe('out');
    expect(existsSync(join(dir, '.flags'))).toBe(false);
  });
});
