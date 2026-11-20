import type { OverridesOptions } from './overrides/reader';
import type { Hook } from './types';

/**
 * The configuration of the SDK: settings for all flags. It is optional. By
 * convention, it is the export `config` of `flags/config.ts`, and the
 * framework binding gives it to `runtime.configure`.
 */
export interface Config {
  /**
   * Which override tokens the SDK accepts. See `OverridesOptions`.
   */
  readonly overrides?: OverridesOptions;
  /**
   * OpenFeature hooks for all flags. They run first, before the hooks of the
   * source, of the call side and of the provider. They also run for
   * overrides, with the reason `OVERRIDE`.
   */
  readonly hooks?: readonly Hook[];
}

/**
 * Returns the configuration as it is, with its exact type.
 *
 * @example
 * ```ts
 * // flags/config.ts
 * export const config = defineConfig({
 *   hooks: [loggingHook],
 * });
 * ```
 */
export function defineConfig<const C extends Config>(config: C): C {
  return config;
}
