/**
 * The build plugin of the Flags SDK for Next.js. Use it in `next.config.ts`:
 *
 * ```ts
 * import { withFlags } from 'flags/next/plugin';
 *
 * export default withFlags({});
 * ```
 *
 * It uses only the public contract of the SDK (the aliases of
 * `flags/integration` and `flags/config`), so that Next.js could take it
 * over.
 */
import { existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { NextConfig } from 'next';

export interface FlagsPluginOptions {
  /**
   * The directory of the application, where the plugin looks for
   * `flags.config.ts`. The default is the current directory.
   */
  readonly dir?: string;
}

const configFileNames = [
  'flags.config.ts',
  'flags.config.mts',
  'flags.config.js',
  'flags.config.mjs',
];

/**
 * Finds `flags.config.ts`, in the directory of the application or in its
 * `src` directory.
 *
 * @internal
 */
export function findConfigFile(dir: string): string | undefined {
  for (const base of [dir, join(dir, 'src')]) {
    for (const name of configFileNames) {
      const file = join(base, name);
      if (existsSync(file)) return file;
    }
  }
  return undefined;
}

/**
 * Adds the Flags SDK to the configuration of Next.js:
 *
 * - The alias `flags/integration` points to `flags/next`, which gives the
 *   runtime the current request of Next.js, and loads the configuration.
 * - The alias `flags/config` points to `flags.config.ts`, if it exists.
 *
 * It sets the aliases for Turbopack and for webpack, and keeps the aliases
 * and the `webpack` function of the configuration.
 */
export function withFlags(
  nextConfig: NextConfig = {},
  options: FlagsPluginOptions = {},
): NextConfig {
  const dir = options.dir ?? process.cwd();
  const configFile = findConfigFile(dir);

  const turbopackAliases: Record<string, string> = {
    'flags/integration': 'flags/next',
  };
  // webpack: `$` makes the alias match only this exact import
  const webpackAliases: Record<string, string> = {
    'flags/integration$': 'flags/next',
  };
  if (configFile) {
    // Turbopack resolves a relative path from the directory of the project
    turbopackAliases['flags/config'] =
      `./${relative(dir, configFile).split(sep).join('/')}`;
    webpackAliases['flags/config$'] = configFile;
  }

  return {
    ...nextConfig,
    turbopack: {
      ...nextConfig.turbopack,
      resolveAlias: {
        ...nextConfig.turbopack?.resolveAlias,
        ...turbopackAliases,
      },
    },
    webpack(config, context) {
      const result = nextConfig.webpack
        ? nextConfig.webpack(config, context)
        : config;
      result.resolve ??= {};
      result.resolve.alias = { ...result.resolve.alias, ...webpackAliases };
      return result;
    },
  };
}
