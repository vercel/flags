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

export { findConfigModules };

import { findConfigModules, MANIFEST_FILE } from 'flags/tooling';
import { prepareCodeGeneration, readAliases } from './code-generation';

export interface FlagsPluginOptions {
  /**
   * The directory of the application, where the plugin looks for
   * `flags/config.ts` and `flags/sources`. The default is the current
   * directory.
   */
  readonly dir?: string;
  /**
   * Turns off the code generation of `flags:<source>`. By default,
   * `withFlags` writes the modules of `flags:<source>` and the types of the
   * flags files: one time for `next build`, and again after each change of
   * a flags file for `next dev`. Without flags files, it writes nothing.
   *
   * With it, `withFlags` returns the configuration itself, not a function
   * of the phase, and still gives Turbopack the aliases of
   * `.flags/aliases.json`, e.g. from `flags sync` or `flags watch`.
   */
  readonly disableCodeGeneration?: boolean;
}

// The phases of Next.js, as in next/constants
const PHASE_DEVELOPMENT_SERVER = 'phase-development-server';
const PHASE_PRODUCTION_BUILD = 'phase-production-build';

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
const FLAGS_FILE_LOADER = '@flags-sdk/next/flags-file-loader';
const MANIFEST_LOADER = '@flags-sdk/next/manifest-loader';
// The module of the route of the manifest, in the build of this package
const manifestModule = /[\\/]dist[\\/]manifest\.c?js$/;
// A flags file, also after Turbopack renamed it with `as: '*.js'`
const flagsFile = /\.flags(\.js)?$/;

// Calls the compiled route of the manifest, and writes its result. In a
// separate process, so that the modules of the application do not run in
// the process of the build. It exits when the file is written: a provider
// can open a connection when its module loads, e.g. LaunchDarkly, and the
// open connection must not keep the build waiting.
const writeManifestScript = `
const fs = require('node:fs');
const [route, output] = process.argv.slice(1);
const { routeModule } = require(route);
Promise.resolve(routeModule.userland.GET())
  .then(async (response) => {
    if (!response.ok) throw new Error('The route returned ' + response.status);
    fs.writeFileSync(output, JSON.stringify(await response.json(), null, 2));
    process.exit(0);
  })
  .catch((error) => {
    // Synchronous, so that exit does not cut off the message
    fs.writeSync(2, String(error && error.stack || error) + '\\n');
    process.exit(1);
  });
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
  const rules: TurbopackRules = {
    ...existing,
    // Flags files become modules with defineSource and source.bindFlag
    '*.flags': {
      loaders: [{ loader: FLAGS_FILE_LOADER, options: { projectDir } }],
      as: '*.js',
    },
  };
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
        condition: {
          all: [
            { not: 'foreign' },
            // A compiled flags file registers its flags itself
            { not: { path: flagsFile } },
            { content: /use flags/ },
          ],
        },
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
 * The configuration of Next.js as a function of the phase. Next.js passes
 * a second argument with the default configuration.
 */
export type NextConfigFunction<T extends object> = (
  phase: string,
  context?: unknown,
) => T | Promise<T>;

/**
 * Adds the Flags SDK to the configuration of Next.js:
 *
 * - The alias `flags/framework` points to `@flags-sdk/next/binding`, which
 *   gives the
 *   runtime the current request of Next.js, and loads the configuration.
 * - The alias `flags/config` points to `flags/config.ts`, if it exists.
 * - A module with the `'use flags'` directive registers its flags itself,
 *   so nobody calls `registerFlags` by hand.
 * - The route `@flags-sdk/next/manifest` gets the modules with `'use flags'`,
 *   and the build writes `flags-manifest.json` into `distDir`.
 * - The secret of precompute for this build goes into the server code, so
 *   that `@flags-sdk/next/precompute` needs no `FLAGS_PRECOMPUTE_SECRET`.
 * - With Cache Components, `FlagValues` encrypts in `'use cache'`, so that
 *   a static page can have encrypted flag values.
 * - A flags file (`*.flags`) becomes a module of its flags, with the
 *   source of its `source` (see "Flags files" in the spec of `flags`).
 * - It writes the modules of `flags:<source>` from the flags files, and
 *   points the aliases `flags:<source>` to them in `.flags`.
 *
 * It supports only Turbopack, and keeps the aliases and the rules of the
 * configuration. A build with webpack throws. The configuration can also be
 * a function of the phase, as in `next.config.ts`.
 */
export function withFlags<T extends object>(
  config?: T | NextConfigFunction<T>,
  options?: FlagsPluginOptions & { readonly disableCodeGeneration?: false },
): NextConfigFunction<T>;
/**
 * Adds the Flags SDK to the configuration of Next.js, without the code
 * generation of `flags:<source>`. Returns the configuration itself.
 */
export function withFlags<T extends object>(
  config: T,
  options: FlagsPluginOptions & { readonly disableCodeGeneration: true },
): T;
/**
 * Adds the Flags SDK to a configuration function of Next.js, without the
 * code generation of `flags:<source>`.
 */
export function withFlags<T extends object>(
  config: NextConfigFunction<T>,
  options: FlagsPluginOptions & { readonly disableCodeGeneration: true },
): NextConfigFunction<T>;
export function withFlags<T extends object>(
  config: T | NextConfigFunction<T> = {} as T,
  options: FlagsPluginOptions = {},
): T | NextConfigFunction<T> {
  const dir = options.dir ?? process.cwd();
  if (options.disableCodeGeneration && typeof config !== 'function') {
    return addFlags(config, dir);
  }
  return async (phase, context) => {
    // `next start` and the other phases write nothing
    if (!options.disableCodeGeneration) {
      if (phase === PHASE_DEVELOPMENT_SERVER) {
        await prepareCodeGeneration(dir, true);
      } else if (phase === PHASE_PRODUCTION_BUILD) {
        await prepareCodeGeneration(dir, false);
      }
    }
    const resolved =
      typeof config === 'function' ? await config(phase, context) : config;
    return addFlags(resolved, dir);
  };
}

function addFlags<T extends object>(config: T, dir: string): T {
  // Typed loosely, so a `next` version other than ours does not clash.
  const nextConfig: NextConfig = config;
  const configModules = findConfigModules(dir);

  const turbopackAliases: Record<string, string> = {
    // The generated modules of flags:<source>, relative to the project
    ...readAliases(dir),
    'flags/framework': '@flags-sdk/next/binding',
  };
  if (usesCacheComponents(nextConfig)) {
    // FlagValues encrypts in 'use cache', so that a prerender can encrypt.
    // Without Cache Components, 'use cache' is an error.
    turbopackAliases['@flags-sdk/next/encrypt-values'] =
      '@flags-sdk/next/encrypt-values-cached';
    // The check of a precomputed code uses WebCrypto, which a prerender
    // counts as uncached data
    turbopackAliases['@flags-sdk/next/verify-code'] =
      '@flags-sdk/next/verify-code-cached';
  }
  // flags/hooks.ts and flags/config.json, for the
  // binding. Turbopack resolves a relative path from the directory of the
  // project.
  for (const [module, file] of Object.entries(configModules)) {
    turbopackAliases[module] = `./${relative(dir, file).split(sep).join('/')}`;
  }

  const result: NextConfig = {
    ...nextConfig,
    compiler: {
      ...nextConfig.compiler,
      // Only in the server code (Node.js and Edge), never in the client
      defineServer: {
        ...nextConfig.compiler?.defineServer,
        'process.env.__FLAGS_PRECOMPUTE_BUILD_SECRET': buildPrecomputeSecret(),
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
