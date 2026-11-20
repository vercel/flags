import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findConfigModules } from 'flags/tooling';
import type { NextConfig } from 'next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { withFlags, writeManifest } from './plugin';

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

  it('points flags/hooks, flags/overrides and flags/settings to the files', () => {
    const dir = projectWith('flags/hooks.ts');
    writeFileSync(join(dir, 'flags/overrides.ts'), 'export default {};');
    writeFileSync(join(dir, 'flags/config.json'), '{}');
    const config = withFlags<NextConfig>(
      {},
      { dir, disableCodeGeneration: true },
    );

    expect(config.turbopack?.resolveAlias).toMatchObject({
      'flags/hooks': './flags/hooks.ts',
      'flags/overrides': './flags/overrides.ts',
      'flags/settings': './flags/config.json',
    });
    // flags/config is the loader of the SDK, not a file of the app
    expect(config.turbopack?.resolveAlias).not.toHaveProperty('flags/config');
  });

  it('finds the files in src/flags', () => {
    const dir = projectWith('src/flags/hooks.ts');

    expect(findConfigModules(dir)).toEqual({
      'flags/hooks': join(dir, 'src', 'flags/hooks.ts'),
    });
    expect(
      withFlags<NextConfig>({}, { dir, disableCodeGeneration: true }).turbopack
        ?.resolveAlias,
    ).toMatchObject({
      'flags/hooks': './src/flags/hooks.ts',
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

  // An app which depends on @vercel/flags-core, with a fake package
  function projectWithVercelFlags() {
    const dir = projectWith();
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ dependencies: { '@vercel/flags-core': '1.0.0' } }),
    );
    const core = join(dir, 'node_modules/@vercel/flags-core');
    mkdirSync(core, { recursive: true });
    writeFileSync(
      join(core, 'package.json'),
      JSON.stringify({
        name: '@vercel/flags-core',
        type: 'module',
        exports: { './catalog': './catalog.js' },
      }),
    );
    writeFileSync(
      join(core, 'catalog.js'),
      "export const loadCatalog = () => ({ flags: { 'summer-sale': { variants: [false, true] } } });",
    );
    return dir;
  }

  it('generates the default source self for an app with @vercel/flags-core', async () => {
    const dir = projectWithVercelFlags();

    const resolved = await withFlags<NextConfig>(
      {},
      { dir },
    )('phase-production-build');

    expect(resolved.turbopack?.resolveAlias).toMatchObject({
      'flags:self': './.flags/self.ts',
    });
  });

  it('generates no default source with "selfSource": false in flags/config.json', async () => {
    const dir = projectWithVercelFlags();
    mkdirSync(join(dir, 'flags'));
    writeFileSync(join(dir, 'flags/config.json'), '{ "selfSource": false }');

    await withFlags<NextConfig>({}, { dir })('phase-production-build');

    expect(existsSync(join(dir, '.flags'))).toBe(false);
  });

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

describe('writeManifest', () => {
  function buildWithRoute(get: string) {
    const distDir = mkdtempSync(join(tmpdir(), 'flags-manifest-'));
    const routeDir = join(
      distDir,
      'server/app/.well-known/flags/manifest.json',
    );
    mkdirSync(routeDir, { recursive: true });
    writeFileSync(
      join(routeDir, 'route.js'),
      `exports.routeModule = { userland: { GET: ${get} } };`,
    );
    return distDir;
  }

  it('writes the manifest and does not wait for open connections', async () => {
    // A provider which connects when its module loads keeps the process open
    const distDir = buildWithRoute(
      `async () => { setInterval(() => {}, 1000); return Response.json({ flags: {} }); }`,
    );
    const started = Date.now();

    await writeManifest(distDir, distDir);

    expect(Date.now() - started).toBeLessThan(10_000);
    expect(
      JSON.parse(readFileSync(join(distDir, 'flags-manifest.json'), 'utf8')),
    ).toEqual({ flags: {} });
  });

  it('fails the build with the error of the route', async () => {
    const distDir = buildWithRoute(
      `async () => new Response(null, { status: 500 })`,
    );

    await expect(writeManifest(distDir, distDir)).rejects.toThrow(
      'The route returned 500',
    );
  });
});
