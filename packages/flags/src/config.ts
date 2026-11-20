import type { DefaultSource } from './default-source';
import type { OverridesOptions } from './overrides/reader';
import type { Source } from './source';
import type { Hook } from './types';

/**
 * The configuration of the SDK. By convention, it is the export `config` of
 * `flags/config.ts`, and the framework binding gives it to
 * `runtime.configure`.
 */
export interface Config {
  /**
   * The source of all flags without a source. Without it, they use the
   * built-in default source, whose provider comes from
   * `flags/default-provider`. For now, the built-in provider throws, unless
   * a platform replaces it, e.g. on Vercel.
   */
  readonly defaultSource?: Source;
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
 * Returns the configuration as it is, with its exact type. It does not use
 * `Register`, so that `Register` can refer to `typeof config` without a
 * circular type.
 *
 * @example
 * ```ts
 * // flags/config.ts
 * export const config = defineConfig({
 *   defaultSource: defineSource({
 *     provider: new VercelProvider(), // of @vercel/flags-core/openfeature
 *     project: { system: 'vercel-flags' },
 *   }),
 * });
 *
 * declare module 'flags' {
 *   interface Register {
 *     config: typeof config;
 *   }
 * }
 * ```
 */
export function defineConfig<const C extends Config>(config: C): C {
  return config;
}

/**
 * Registers types for the application. Register the type of the
 * configuration, so that flags without a source get the types of the
 * configured default source.
 */
// biome-ignore lint/suspicious/noEmptyInterface: applications add to it
export interface Register {}

type RegisteredConfig = Register extends { config: infer C }
  ? C
  : Record<never, never>;

/**
 * The source of flags without a source: the registered
 * `defaultSource`, or the built-in default source.
 */
export type ConfiguredSource = RegisteredConfig extends {
  defaultSource: infer D extends Source;
}
  ? D
  : DefaultSource;
