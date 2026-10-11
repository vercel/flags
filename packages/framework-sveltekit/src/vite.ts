/**
 * The Vite plugin of the Flags SDK for SvelteKit:
 *
 * ```ts
 * // vite.config.ts
 * import { sveltekit } from '@sveltejs/kit/vite';
 * import { flags } from '@flags-sdk/sveltekit/vite';
 * import { defineConfig } from 'vite';
 *
 * export default defineConfig({ plugins: [sveltekit(), flags()] });
 * ```
 *
 * It points `flags/framework` to the binding of this package, and does the
 * rest of `@flags-sdk/vite`: `flags.config.ts`, `'use flags'` modules, the
 * manifest of the flags, and the default provider of the platform. The
 * adapter of SvelteKit runs after the build of Vite, so it is too late for
 * the alias of the default provider. Thus, the plugin sets it.
 */
import { flags as flagsVite } from '@flags-sdk/vite';
import type { Plugin } from 'vite';

export interface FlagsSvelteKitOptions {
  /**
   * The module of the default provider, e.g. of a platform. See
   * `@flags-sdk/vite`.
   */
  readonly defaultProvider?: string | false;
}

export function flags(options: FlagsSvelteKitOptions = {}): Plugin {
  return flagsVite({
    ...options,
    binding: '@flags-sdk/sveltekit/binding',
    bundle: ['@flags-sdk/sveltekit'],
    // isRedirect() of the binding must recognize the redirect() of the
    // application, so both use the copy of the project
    dedupe: ['@sveltejs/kit'],
  });
}
