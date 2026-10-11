/**
 * The Vite plugin of the Flags SDK for TanStack Start:
 *
 * ```ts
 * // vite.config.ts
 * import { flags } from '@flags-sdk/tanstack-start/vite';
 *
 * export default defineConfig({
 *   plugins: [nitro(), tanstackStart(), viteReact(), flags()],
 * });
 * ```
 *
 * It points `flags/framework` to the binding of this package, and does the
 * rest of `@flags-sdk/vite`: `flags.config.ts`, `'use flags'` modules, the
 * manifest of the flags, and the default provider of the platform.
 */
import { flags as flagsVite } from '@flags-sdk/vite';
import type { Plugin } from 'vite';

export interface FlagsTanStackStartOptions {
  /**
   * The module of the default provider, e.g. of a platform. See
   * `@flags-sdk/vite`.
   */
  readonly defaultProvider?: string | false;
}

export function flags(options: FlagsTanStackStartOptions = {}): Plugin {
  return flagsVite({
    ...options,
    binding: '@flags-sdk/tanstack-start/binding',
    bundle: ['@flags-sdk/tanstack-start'],
    // The binding works with TanStack Start for React and for Solid
    projectModules: {
      'flags:tanstack-start/server': [
        '@tanstack/react-start/server',
        '@tanstack/solid-start/server',
      ],
      'flags:tanstack-start/router': [
        '@tanstack/react-router',
        '@tanstack/solid-router',
      ],
    },
  });
}
