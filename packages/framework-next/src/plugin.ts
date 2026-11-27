import { execFile } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { MANIFEST_FILE } from 'flags/tooling';
import type { NextConfig } from 'next';

/**
 * The module behind the alias `flags/framework`: the binding of Next.js.
 */
const BINDING = '@flags-sdk/next/binding';

const MANIFEST_LOADER = '@flags-sdk/next/manifest-loader';
// The module of the route of the manifest, in the build of this package
const manifestModule = /[\\/]dist[\\/]manifest\.c?js$/;

export interface FlagsPluginOptions {
  /**
   * The directory of the application, where the plugin looks for modules
   * with the `'use flags'` directive. The default is the current directory.
   */
  readonly dir?: string;
}

type NextConfigFunction<T> = (
  phase: string,
  context: { defaultConfig: T },
) => T | Promise<T>;

type TurbopackRules = NonNullable<
  NonNullable<NextConfig['turbopack']>['rules']
>;

// Calls the compiled route of the manifest, and writes its result. In a
// separate process, so that the modules of the application do not run in
// the process of the build. It exits when the file is written: a module can
// open a connection when it loads, and the open connection must not keep
// the build waiting.
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
  if (!existsSync(route)) {
    return;
  }
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
      `flags: Could not write ${MANIFEST_FILE}. ${error.stderr || String(error)}`,
    );
  });
}

function asArray<T>(value: T | readonly T[] | undefined): T[] {
  if (value === undefined) {
    return [];
  }
  if (Array.isArray(value)) {
    return [...value];
  }
  return [value as T];
}

/**
 * Turbopack: the loader of the manifest runs only for the route module of
 * this package, which has the marker. It keeps the rules of the
 * configuration.
 */
function turbopackRules(
  existing: TurbopackRules | undefined,
  projectDir: string,
): TurbopackRules {
  const rules: TurbopackRules = { ...existing };
  for (const glob of ['*.js', '*.cjs']) {
    rules[glob] = [
      ...asArray(rules[glob]),
      {
        condition: {
          all: [
            { path: manifestModule },
            { content: /flags:use-flags-modules/ },
          ],
        },
        loaders: [{ loader: MANIFEST_LOADER, options: { projectDir } }],
      },
    ] as TurbopackRules[string];
  }
  return rules;
}

function addFlags<T extends object>(input: T, dir: string): T {
  // Typed loosely, so that a `next` version other than ours does not clash
  const config: NextConfig = input;
  const result: NextConfig = {
    ...config,
    compiler: {
      ...config.compiler,
      async runAfterProductionCompile(metadata) {
        await config.compiler?.runAfterProductionCompile?.(metadata);
        await writeManifest(metadata.distDir, metadata.projectDir);
      },
    },
    turbopack: {
      ...config.turbopack,
      resolveAlias: {
        ...config.turbopack?.resolveAlias,
        // flags imports flags/framework, so the SDK gets the current request
        // of Next.js from the binding
        'flags/framework': BINDING,
      },
      rules: turbopackRules(config.turbopack?.rules, dir),
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

/**
 * Connects the Flags SDK to Next.js:
 *
 * - It points the alias `flags/framework` to the binding of Next.js, so
 *   that a flag gets the current request of the App Router from `headers()`
 *   and `cookies()`.
 * - The route `@flags-sdk/next/manifest` gets the modules with the
 *   `'use flags'` directive, and `next build` writes `flags-manifest.json`
 *   into `distDir`.
 *
 * It supports only Turbopack, and keeps the aliases and the rules of the
 * configuration. A build with webpack throws. The configuration can also be
 * a function of the phase, as in `next.config.ts`.
 *
 * @example
 * ```ts
 * // next.config.ts
 * import { withFlags } from '@flags-sdk/next/plugin';
 *
 * export default withFlags({});
 * ```
 */
export function withFlags<T extends object>(
  config: T,
  options?: FlagsPluginOptions,
): T;
export function withFlags<T extends object>(
  config: NextConfigFunction<T>,
  options?: FlagsPluginOptions,
): NextConfigFunction<T>;
export function withFlags<T extends object>(
  config: T | NextConfigFunction<T>,
  options: FlagsPluginOptions = {},
): T | NextConfigFunction<T> {
  const dir = options.dir ?? process.cwd();
  if (typeof config === 'function') {
    return async (phase, context) =>
      addFlags(await config(phase, context), dir);
  }
  return addFlags(config, dir);
}
