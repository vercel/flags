import type { NextConfig } from 'next';

/**
 * The module behind the alias `flags/framework`: the binding of Next.js.
 */
const BINDING = '@flags-sdk/next/binding';

type NextConfigFunction<T> = (
  phase: string,
  context: { defaultConfig: T },
) => T | Promise<T>;

function addFlags<T extends NextConfig>(config: T): T {
  return {
    ...config,
    turbopack: {
      ...config.turbopack,
      resolveAlias: {
        ...config.turbopack?.resolveAlias,
        // flags imports flags/framework, so the SDK gets the current request
        // of Next.js from the binding
        'flags/framework': BINDING,
      },
    },
    // Next.js calls it only for a build with webpack
    webpack() {
      throw new Error(
        'flags: withFlags supports only Turbopack. Remove --webpack from next dev and next build.',
      );
    },
  };
}

/**
 * Connects the Flags SDK to Next.js. It points the alias `flags/framework`
 * to the binding of Next.js, so that a flag gets the current request of the
 * App Router from `headers()` and `cookies()`.
 *
 * It supports only Turbopack, and keeps the aliases of the configuration. A
 * build with webpack throws. The configuration can also be a function of the
 * phase, as in `next.config.ts`.
 *
 * @example
 * ```ts
 * // next.config.ts
 * import { withFlags } from '@flags-sdk/next/plugin';
 *
 * export default withFlags({});
 * ```
 */
export function withFlags<T extends NextConfig>(config: T): T;
export function withFlags<T extends NextConfig>(
  config: NextConfigFunction<T>,
): NextConfigFunction<T>;
export function withFlags<T extends NextConfig>(
  config: T | NextConfigFunction<T>,
): T | NextConfigFunction<T> {
  if (typeof config === 'function') {
    return async (phase, context) => addFlags(await config(phase, context));
  }
  return addFlags(config);
}
