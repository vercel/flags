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
 * rest of `@flags-sdk/vite`: `flags/config.ts`, `'use flags'` modules, the
 * manifest of the flags, and the code generation of `flags:<source>`.
 */
import { flags as flagsVite } from '@flags-sdk/vite';
import type { Plugin } from 'vite';

export interface FlagsSvelteKitOptions {
  /**
   * Turns off the code generation of `flags:<source>` from the catalogs of
   * `flags/sources/<source>`, which is on by default. See `@flags-sdk/vite`.
   */
  readonly disableCodeGeneration?: boolean;
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
