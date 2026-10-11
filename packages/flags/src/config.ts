import type { Connection } from './connection';
import type { DefaultConnection } from './default-connection';
import type { OverridesOptions } from './overrides/reader';
import type { Hook } from './types';

/**
 * The configuration of the SDK. By convention, it is the export `config` of
 * `flags.config.ts`, and the framework binding gives it to
 * `runtime.configure`.
 */
export interface Config {
  /**
   * The connection of all flags without a connection. Without it, they use
   * Vercel Flags through the built-in default provider.
   */
  readonly defaultConnection?: Connection;
  /**
   * Which override tokens the SDK accepts. See `OverridesOptions`.
   */
  readonly overrides?: OverridesOptions;
  /**
   * OpenFeature hooks for all flags. They run first, before the hooks of the
   * connection, of the call side and of the provider. They also run for
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
 * // flags.config.ts
 * export const config = defineConfig({
 *   defaultConnection: defineConnection({
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
 * configuration, so that flags without a connection get the types of the
 * configured default connection.
 */
// biome-ignore lint/suspicious/noEmptyInterface: applications add to it
export interface Register {}

type RegisteredConfig = Register extends { config: infer C }
  ? C
  : Record<never, never>;

/**
 * The connection of flags without a connection: the registered
 * `defaultConnection`, or the built-in default connection.
 */
export type ConfiguredConnection = RegisteredConfig extends {
  defaultConnection: infer D extends Connection;
}
  ? D
  : DefaultConnection;
