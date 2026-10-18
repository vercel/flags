/**
 * The build plugin of the Flags SDK for Next.js. Use it in `next.config.ts`:
 *
 * ```ts
 * import { withFlags } from '@flags-sdk/next/plugin';
 *
 * export default withFlags({});
 * ```
 *
 * It uses only the public contract of the SDK (the aliases of
 * `flags/framework` and `flags/config`), so that Next.js could take it
 * over.
 */
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { promisify } from 'node:util';
import type { NextConfig } from 'next';

export { findConfigFile };

import { findConfigFile, MANIFEST_FILE } from 'flags/tooling';

export interface FlagsPluginOptions {
  /**
   * The directory of the application, where the plugin looks for
   * `flags.config.ts`. The default is the current directory.
   */
  readonly dir?: string;
}

// Next.js can load the configuration more than once during one build, e.g.
// in the workers of the build. They inherit the environment of the main
// process, so the key stays the same for the whole build.
const BUILD_KEY_SEED = '__FLAGS_PRECOMPUTE_BUILD_KEY';

/**
 * The secret of precompute for this build: `FLAGS_PRECOMPUTE_SECRET`, or a
 * random key.
 *
 * @internal
 */
export function buildPrecomputeSecret(): string {
  const fromEnv = process.env.FLAGS_PRECOMPUTE_SECRET;
  if (fromEnv) return fromEnv;
  process.env[BUILD_KEY_SEED] ??= randomBytes(32).toString('base64url');
  return process.env[BUILD_KEY_SEED];
}

/**
 * Whether the configuration enables Cache Components, also with the names of
 * Next.js 15.
 *
 * @internal
 */
export function usesCacheComponents(config: NextConfig): boolean {
  const loose = config as {
    cacheComponents?: unknown;
    experimental?: { cacheComponents?: unknown; dynamicIO?: unknown };
  };
  return Boolean(
    loose.cacheComponents ??
      loose.experimental?.cacheComponents ??
      loose.experimental?.dynamicIO,
  );
}

const LOADER = '@flags-sdk/next/use-flags-loader';
const MANIFEST_LOADER = '@flags-sdk/next/manifest-loader';
// The module of the route of the manifest, in the build of the SDK
// The module of the route of the manifest, in the build of this package
const manifestModule = /[\\/]dist[\\/]manifest\.c?js$/;

// Calls the compiled route of the manifest, and writes its result. In a
// separate process, so that the modules of the application do not run in
// the process of the build.
const writeManifestScript = `
const [route, output] = process.argv.slice(1);
const { routeModule } = require(route);
Promise.resolve(routeModule.userland.GET())
  .then(async (response) => {
    if (!response.ok) throw new Error('The route returned ' + response.status);
    require('node:fs').writeFileSync(output, JSON.stringify(await response.json(), null, 2));
  })
  .catch((error) => { console.error(error); process.exitCode = 1; });
`;

/**
 * Writes `flags-manifest.json` into `distDir` after the compile, if the
 * application has the route of the manifest. The manifest is an optional
 * feature, so without the route there is no file.
 *
 * @internal
 */
export async function writeManifest(
  distDir: string,
  projectDir: string,
): Promise<void> {
  const output = join(distDir, MANIFEST_FILE);
  rmSync(output, { force: true });
  const route = join(
    distDir,
    'server/app/.well-known/flags/manifest.json/route.js',
  );
  if (!existsSync(route)) return;
  await promisify(execFile)(
    process.execPath,
    ['-e', writeManifestScript, route, output],
    {
      cwd: projectDir,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        __FLAGS_WRITE_MANIFEST: '1',
      },
      timeout: 60_000,
    },
  ).catch((error: { stderr?: string }) => {
    throw new Error(
      `flags: Could not write ${MANIFEST_FILE}. ${error.stderr ?? String(error)}`,
    );
  });
}
const sourceExtensions = ['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs'];

type TurbopackRules = NonNullable<
  NonNullable<NextConfig['turbopack']>['rules']
>;

/**
 * Turbopack: the loader runs only for modules of the application which
 * contain `use flags`. The loader then examines the directive prologue.
 */
function turbopackRules(
  existing: TurbopackRules | undefined,
  projectDir: string,
): TurbopackRules {
  const rules: TurbopackRules = { ...existing };
  for (const extension of sourceExtensions) {
    const glob = `*.${extension}`;
    const current = rules[glob];
    rules[glob] = [
      ...(current === undefined
        ? []
        : Array.isArray(current)
          ? current
          : [current]),
      {
        condition: { all: [{ not: 'foreign' }, { content: /use flags/ }] },
        loaders: [LOADER],
      },
      ...(extension === 'js' || extension === 'cjs'
        ? [
            {
              // Only the module with the marker, not e.g. flags/manifest
              condition: {
                all: [
                  { path: manifestModule },
                  { content: /flags:use-flags-modules/ },
                ],
              },
              loaders: [{ loader: MANIFEST_LOADER, options: { projectDir } }],
            },
          ]
        : []),
    ] as TurbopackRules[string];
  }
  return rules;
}

/**
 * Adds the Flags SDK to the configuration of Next.js:
 *
 * - The alias `flags/framework` points to `@flags-sdk/next/binding`, which
 *   gives the
 *   runtime the current request of Next.js, and loads the configuration.
 * - The alias `flags/config` points to `flags.config.ts`, if it exists.
 * - A module with the `'use flags'` directive registers its flags itself,
 *   so nobody calls `registerFlags` by hand.
 * - The route `@flags-sdk/next/manifest` gets the modules with `'use flags'`,
 *   and the build writes `flags-manifest.json` into `distDir`.
 * - The secret of precompute for this build goes into the server code, so
 *   that `@flags-sdk/next/precompute` needs no `FLAGS_PRECOMPUTE_SECRET`.
 * - The server code knows whether Cache Components are enabled, for
 *   `@flags-sdk/next/flag-values`.
 *
 * It supports only Turbopack, and keeps the aliases and the rules of the
 * configuration. A build with webpack throws.
 */
export function withFlags<T extends object>(
  config: T = {} as T,
  options: FlagsPluginOptions = {},
): T {
  // Typed loosely, so a `next` version other than ours does not clash.
  const nextConfig: NextConfig = config;
  const dir = options.dir ?? process.cwd();
  const configFile = findConfigFile(dir);

  const turbopackAliases: Record<string, string> = {
    'flags/framework': '@flags-sdk/next/binding',
  };
  if (configFile) {
    // Turbopack resolves a relative path from the directory of the project
    turbopackAliases['flags/config'] =
      `./${relative(dir, configFile).split(sep).join('/')}`;
  }

  const result: NextConfig = {
    ...nextConfig,
    compiler: {
      ...nextConfig.compiler,
      // Only in the server code (Node.js and Edge), never in the client
      defineServer: {
        ...nextConfig.compiler?.defineServer,
        'process.env.__FLAGS_PRECOMPUTE_BUILD_SECRET': buildPrecomputeSecret(),
        // For FlagValues, which must not encrypt in a prerender of Cache
        // Components
        'process.env.__FLAGS_NEXT_CACHE_COMPONENTS': String(
          usesCacheComponents(nextConfig),
        ),
      },
      async runAfterProductionCompile(metadata) {
        await nextConfig.compiler?.runAfterProductionCompile?.(metadata);
        await writeManifest(metadata.distDir, metadata.projectDir);
      },
    },
    turbopack: {
      ...nextConfig.turbopack,
      resolveAlias: {
        ...nextConfig.turbopack?.resolveAlias,
        ...turbopackAliases,
      },
      rules: turbopackRules(nextConfig.turbopack?.rules, dir),
    },
    // Next.js calls it only for a build with webpack
    webpack() {
      throw new Error(
        'flags: withFlags supports only Turbopack. Remove --webpack from next dev and next build.',
      );
    },
  };
  return result as T;
}
