import type { OverridesOptions } from './overrides/reader';
import type { Settings } from './settings';
import type { Hook } from './types';

/**
 * The configuration of the SDK, for all flags. Each part is optional. With
 * the file system API, each part has its own file in the folder `flags`, and
 * the framework binding gives them to `runtime.configure`:
 *
 * - `hooks`: the default export of `flags/hooks.ts`
 * - `overrides`: the default export of `flags/overrides.ts`
 * - `settings`: `flags/config.json`
 *
 * Without a framework plugin, call `runtime.configure` yourself.
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
  /**
   * The static settings of `flags/config.json`, which the plugins and the
   * CLI also read. See `Settings`.
   */
  readonly settings?: Settings;
}
