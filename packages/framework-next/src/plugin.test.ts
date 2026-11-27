import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NextConfig } from 'next';
import { describe, expect, it, vi } from 'vitest';
import { withFlags, writeManifest } from './plugin';

describe('withFlags', () => {
  it('points flags/framework to the binding of Next.js', () => {
    const config = withFlags<NextConfig>({});

    expect(config.turbopack?.resolveAlias).toEqual({
      'flags/framework': '@flags-sdk/next/binding',
    });
  });

  it('keeps the configuration and its aliases', () => {
    const config = withFlags<NextConfig>({
      reactStrictMode: true,
      turbopack: { resolveAlias: { 'my-module': './my-module.ts' } },
    });

    expect(config.reactStrictMode).toBe(true);
    expect(config.turbopack?.resolveAlias).toEqual({
      'my-module': './my-module.ts',
      'flags/framework': '@flags-sdk/next/binding',
    });
  });

  it('takes a configuration function of the phase', async () => {
    const config = withFlags<NextConfig>(async (phase) => ({
      distDir: phase === 'phase-production-build' ? 'out' : '.next',
    }));

    const resolved = await config('phase-production-build', {
      defaultConfig: {},
    });
    expect(resolved.distDir).toBe('out');
    expect(resolved.turbopack?.resolveAlias).toEqual({
      'flags/framework': '@flags-sdk/next/binding',
    });
  });

  it('throws for a build with webpack', () => {
    const config = withFlags<NextConfig>({});

    expect(() => (config.webpack as () => unknown)()).toThrow(
      'flags: withFlags supports only Turbopack.',
    );
  });

  it('runs the loader of the manifest only for the route of this package', () => {
    const config = withFlags<NextConfig>({}, { dir: '/app' });

    const rules = config.turbopack?.rules;
    expect(Object.keys(rules ?? {})).toEqual(['*.js', '*.cjs']);
    expect(rules?.['*.js']).toEqual([
      {
        condition: {
          all: [
            { path: /[\\/]dist[\\/]manifest\.c?js$/ },
            { content: /flags:use-flags-modules/ },
          ],
        },
        loaders: [
          {
            loader: '@flags-sdk/next/manifest-loader',
            options: { projectDir: '/app' },
          },
        ],
      },
    ]);
  });

  it('keeps the rules of the configuration', () => {
    const own = { loaders: ['my-loader'] };
    const config = withFlags<NextConfig>({
      turbopack: { rules: { '*.js': own, '*.svg': own } },
    });

    const rules = config.turbopack?.rules;
    expect(rules?.['*.svg']).toBe(own);
    expect((rules?.['*.js'] as unknown[])[0]).toBe(own);
    expect(rules?.['*.js']).toHaveLength(2);
  });

  it('writes the manifest after the compile of the build', async () => {
    const own = vi.fn();
    const config = withFlags<NextConfig>({
      compiler: { runAfterProductionCompile: own },
    });
    // Without the route of the manifest, there is no file
    const distDir = mkdtempSync(join(tmpdir(), 'flags-next-'));
    const metadata = { distDir, projectDir: distDir };

    await config.compiler?.runAfterProductionCompile?.(metadata);

    expect(own).toHaveBeenCalledWith(metadata);
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
    // A module which connects when it loads keeps the process open
    const distDir = buildWithRoute(
      'async () => { setInterval(() => {}, 1000); return Response.json({ version: 1 }); }',
    );
    const started = Date.now();

    await writeManifest(distDir, distDir);

    expect(Date.now() - started).toBeLessThan(10_000);
    expect(
      JSON.parse(readFileSync(join(distDir, 'flags-manifest.json'), 'utf8')),
    ).toEqual({ version: 1 });
  });

  it('fails the build with the error of the route', async () => {
    const distDir = buildWithRoute(
      'async () => new Response(null, { status: 500 })',
    );

    await expect(writeManifest(distDir, distDir)).rejects.toThrow(
      'The route returned 500',
    );
  });

  it('removes an old manifest when the route is gone', async () => {
    const distDir = mkdtempSync(join(tmpdir(), 'flags-manifest-'));
    const file = join(distDir, 'flags-manifest.json');
    writeFileSync(file, '{}');

    await writeManifest(distDir, distDir);

    expect(() => readFileSync(file)).toThrow();
  });
});
