import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

/**
 * The module behind the alias `flags/framework`: the binding of SvelteKit,
 * next to this module. It is an absolute path, because Vite resolves the
 * target of an alias from the importer, `flags`, which does not depend on
 * this package.
 */
const BINDING = fileURLToPath(new URL('./binding.js', import.meta.url));

/**
 * The packages which Vite must bundle into the server code: the alias only
 * applies to bundled code, and the binding imports `$app/server` and `$env`
 * of SvelteKit, which only exist in the bundle.
 */
const BUNDLED = ['flags', '@flags-sdk/sveltekit'];

/**
 * Connects the Flags SDK to SvelteKit. It points the alias `flags/framework`
 * to the binding of SvelteKit, so that a flag gets the current request from
 * `getRequestEvent()` of `$app/server`.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { sveltekit } from '@sveltejs/kit/vite';
 * import { flags } from '@flags-sdk/sveltekit/vite';
 * import { defineConfig } from 'vite';
 *
 * export default defineConfig({ plugins: [sveltekit(), flags()] });
 * ```
 */
export function flags(): Plugin {
  return {
    name: 'flags-sdk-sveltekit',
    config() {
      return {
        resolve: {
          alias: [{ find: /^flags\/framework$/, replacement: BINDING }],
        },
        ssr: { noExternal: BUNDLED },
        optimizeDeps: { exclude: BUNDLED },
      };
    },
  };
}
