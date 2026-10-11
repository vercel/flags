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
 * - The framework binding (`flags/nuxt/runtime`) gives the SDK the request
 *   with `useEvent()`, and `flags.config.ts`. The module sets
 *   `experimental.asyncContext` of Nitro for it.
 * - A Nitro plugin calls `runtime.onInit` and `runtime.onShutdown`.
 *
 * It is a plain function and uses only hooks of Nuxt, so that the SDK does
 * not depend on `@nuxt/kit`.
 */
import { createRequire } from 'node:module';
import { findConfigFile } from './config-file';
import { flags } from './vite';

type Plugins = unknown[] | unknown;

interface NitroConfig {
  rollupConfig?: { plugins?: Plugins };
  alias?: Record<string, string>;
  externals?: { inline?: (string | RegExp)[] };
  experimental?: { asyncContext?: boolean };
  plugins?: string[];
}

// The modules of the package, as paths, for the aliases and plugins of Nitro
const resolve = (id: string) =>
  createRequire(`${process.cwd()}/package.json`).resolve(id);

interface Nuxt {
  readonly options: { readonly rootDir: string; readonly dev: boolean };
  hook(
    name: 'vite:extendConfig',
    callback: (config: { plugins?: unknown[] }) => void,
  ): void;
  hook(name: 'nitro:config', callback: (config: NitroConfig) => void): void;
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
  const configFile = findConfigFile(root);
  nuxt.hook('nitro:config', (config) => {
    // useEvent() of the binding needs the async context of Nitro
    config.experimental = { ...config.experimental, asyncContext: true };
    // The aliases only reach the SDK when Nitro bundles it
    config.externals = {
      ...config.externals,
      inline: [...(config.externals?.inline ?? []), 'flags'],
    };
    config.alias = {
      ...config.alias,
      'flags/framework': resolve('flags/nuxt/runtime'),
      ...(configFile ? { 'flags/config': configFile } : {}),
    };
    config.plugins = [...(config.plugins ?? []), resolve('flags/nuxt/plugin')];
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
