import { isExportedFlag } from './manifest';
import { runtime } from './runtime';
import { isSource, type Source } from './source';

/**
 * Registers sources with the runtime.
 *
 * Use this when you have the sources themselves. The runtime then
 * initializes their providers in `runtime.onInit()`, before the first request.
 *
 * Sources of flags are registered when the flag is defined, so you only
 * need this for sources whose flags are defined later, e.g. in modules
 * which are imported lazily. To register the flags of a module, use
 * `registerFlags` instead.
 *
 * @example
 * ```ts
 * registerSources([launchdarkly, inMemory]);
 * ```
 */
export function registerSources(sources: Iterable<Source>): void {
  for (const source of sources) {
    if (!isSource(source)) {
      throw new Error(
        'flags: registerSources only accepts sources returned by defineSource.',
      );
    }
    runtime.registerSource(source);
  }
}

/**
 * Registers the sources of all flags a module exports.
 *
 * Use this with the exports of a module which only exports flags, e.g. a
 * module with the `'use flags'` directive. The framework plugins call it for
 * these modules, e.g. `withFlags` of `@flags-sdk/next/plugin`. Without a plugin,
 * call it with the module namespace object.
 *
 * A flag is any object or function with a `key`, e.g. a flag of
 * `defineFlag`. Throws if an export is not a flag. To register sources
 * directly, use `registerSources` instead.
 *
 * @example
 * ```ts
 * import * as flags from './flags';
 *
 * registerFlags(flags);
 * ```
 */
export function registerFlags(moduleExports: Record<string, unknown>): void {
  const flags = Object.entries(moduleExports).map(([name, value]) => {
    if (!isExportedFlag(value)) {
      throw new Error(
        `flags: registerFlags expects only flags, but export "${name}" is not a flag.`,
      );
    }
    return value as { source?: unknown };
  });
  for (const flag of flags) {
    const { source } = flag;
    if (!isSource(source)) {
      continue;
    }
    runtime.registerSource(source);
  }
}
