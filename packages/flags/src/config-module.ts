/**
 * The subpath `flags/config`. A framework binding builds the configuration
 * of the application with `configFromModules`, in `runtime.setLoadConfig`:
 *
 * ```ts
 * runtime.setLoadConfig(async () => {
 *   const { configFromModules } = await import('flags/config');
 *   return configFromModules(
 *     await Promise.all([import('flags/hooks'), import('flags/settings')]),
 *   );
 * });
 * ```
 *
 * A framework plugin replaces the two modules with bundler aliases of the
 * files of the application: `flags/hooks` (`flags/hooks.ts`) and
 * `flags/settings` (`flags/config.json`). Without a file, the module of
 * `flags` is empty. The binding imports them itself, not this module: the
 * binding is bundled, so the aliases apply, also when a framework loads
 * `flags` itself from `node_modules`, e.g. Nitro in `nuxt dev`. This module
 * does not import `flags`, so the binding can use it.
 */
import type { Config } from './config';
import type { Settings } from './settings';
import type { Hook } from './types';

/**
 * The modules `flags/hooks` and `flags/settings`.
 */
export type ConfigModules = readonly [
  { readonly default?: readonly Hook[] },
  { readonly default?: Settings },
];

let last:
  | {
      readonly hooks: unknown;
      readonly settings: unknown;
      readonly config: Config;
    }
  | undefined;

/**
 * Builds the configuration from the files of the application. It returns
 * the same object as long as the files do not change, because the runtime
 * configures again for each new object (in development, before each
 * evaluation).
 */
export function configFromModules([hooks, settings]: ConfigModules): Config {
  if (
    last !== undefined &&
    last.hooks === hooks.default &&
    last.settings === settings.default
  ) {
    return last.config;
  }
  const config: Config = {
    ...(hooks.default ? { hooks: hooks.default } : {}),
    ...(settings.default ? { settings: settings.default } : {}),
  };
  last = { hooks: hooks.default, settings: settings.default, config };
  return config;
}
