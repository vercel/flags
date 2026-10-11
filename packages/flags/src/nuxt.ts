/**
 * The Nuxt module of the Flags SDK:
 *
 * ```ts
 * // nuxt.config.ts
 * export default defineNuxtConfig({ modules: ['flags/nuxt'] });
 * ```
 *
 * Nuxt builds the app with Vite, and the server output with Nitro. The
 * module adds the plugin of `flags/vite` to both:
 *
 * - Vite: modules with `'use flags'` register their flags, and the manifest
 *   of the flags is at `/.well-known/flags/manifest.json` in development.
 * - Nitro: the same registration for server routes, and the build writes
 *   `flags-manifest.json` into the server output (`.output/server`).
 *
 * It is a plain function and uses only hooks of Nuxt, so that the SDK does
 * not depend on `@nuxt/kit`.
 */
import { flags } from './vite';

type Plugins = unknown[] | unknown;

interface Nuxt {
  readonly options: { readonly rootDir: string; readonly dev: boolean };
  hook(
    name: 'vite:extendConfig',
    callback: (config: { plugins?: unknown[] }) => void,
  ): void;
  hook(
    name: 'nitro:config',
    callback: (config: { rollupConfig?: { plugins?: Plugins } }) => void,
  ): void;
}

function asArray(plugins: Plugins): unknown[] {
  if (plugins === undefined) return [];
  return Array.isArray(plugins) ? plugins : [plugins];
}

export default function flagsNuxtModule(_options: unknown, nuxt: Nuxt): void {
  const root = nuxt.options.rootDir;
  nuxt.hook('vite:extendConfig', (config) => {
    config.plugins = [
      ...(config.plugins ?? []),
      flags({ root, manifest: false }),
    ];
  });
  nuxt.hook('nitro:config', (config) => {
    config.rollupConfig ??= {};
    config.rollupConfig.plugins = [
      ...asArray(config.rollupConfig.plugins),
      // In development, Nitro also builds, but without a manifest
      flags({ root, manifest: !nuxt.options.dev }),
    ];
  });
}

/**
 * Nuxt reads the metadata of a module from this property.
 */
flagsNuxtModule.meta = { name: 'flags', configKey: 'flags' };
