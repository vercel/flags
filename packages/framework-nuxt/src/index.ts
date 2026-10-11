/**
 * The Nuxt module of the Flags SDK:
 *
 * ```ts
 * // nuxt.config.ts
 * export default defineNuxtConfig({ modules: ['@flags-sdk/nuxt'] });
 * ```
 *
 * Nuxt builds the app with Vite, and the server output with Nitro. The
 * module adds the plugin of `@flags-sdk/vite` to both:
 *
 * - Vite: modules with `'use flags'` register their flags, and the manifest
 *   of the flags is at `/.well-known/flags/manifest.json` in development.
 * - Nitro: the same registration for server routes, and the build writes
 *   `flags-manifest.json` into the server output (`.output/server`).
 * - The framework binding (`@flags-sdk/nuxt/binding`) gives the SDK the
 *   request
 *   with `useEvent()`, and `flags.config.ts`. The module sets
 *   `experimental.asyncContext` of Nitro for it.
 * - A Nitro plugin calls `runtime.onInit` and `runtime.onShutdown`.
 * - The default provider of the platform: during a build on Vercel, the
 *   provider of `@vercel/flags-core`, if the project has it, or the module
 *   of the option `defaultProvider`.
 *
 * It is a plain function and uses only hooks of Nuxt, so that the SDK does
 * not depend on `@nuxt/kit`.
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { flags, platformDefaultProvider } from '@flags-sdk/vite';
import { findConfigFile } from 'flags/tooling';

type Plugins = unknown[] | unknown;

interface NitroConfig {
  rollupConfig?: { plugins?: Plugins };
  alias?: Record<string, string>;
  externals?: { inline?: (string | RegExp)[] };
  experimental?: { asyncContext?: boolean };
  plugins?: string[];
}

interface Nuxt {
  readonly options: { readonly rootDir: string; readonly dev: boolean };
  hook(
    name: 'vite:extendConfig',
    callback: (config: { plugins?: unknown[] }) => void,
  ): void;
  hook(name: 'nitro:config', callback: (config: NitroConfig) => void): void;
}

export interface FlagsNuxtOptions {
  /**
   * The module of the default provider, e.g. of a platform, instead of the
   * built-in OFREP provider. A path is relative to the project. During a
   * build on Vercel, the default is `@vercel/flags-core/default-provider`,
   * if the project has it. `false` turns this off.
   *
   * ```ts
   * modules: [['@flags-sdk/nuxt', { defaultProvider: './provider.ts' }]]
   * ```
   */
  readonly defaultProvider?: string | false;
}

/**
 * A module of this package, as the path of its ESM file. Nitro bundles it.
 * The ESM file, and not the CommonJS file of `require.resolve`, so that the
 * bundle has one copy of the SDK.
 */
function ownModule(name: 'binding' | 'plugin'): string {
  return fileURLToPath(new URL(`./${name}.js`, import.meta.url));
}

function asArray(plugins: Plugins): unknown[] {
  if (plugins === undefined) return [];
  return Array.isArray(plugins) ? plugins : [plugins];
}

export default function flagsNuxtModule(
  options: FlagsNuxtOptions | undefined,
  nuxt: Nuxt,
): void {
  const root = nuxt.options.rootDir;
  // A module of the project or of a package of the project, as a path for
  // the aliases of Nitro
  const resolve = (id: string) =>
    id.startsWith('.')
      ? join(root, id)
      : createRequire(join(root, 'package.json')).resolve(id);
  const defaultProvider =
    options?.defaultProvider === false
      ? undefined
      : (options?.defaultProvider ??
        platformDefaultProvider(root, !nuxt.options.dev));

  nuxt.hook('vite:extendConfig', (config) => {
    config.plugins = [
      ...(config.plugins ?? []),
      // Nitro bundles the server code again, with the binding and the
      // default provider
      flags({ root, manifest: false, defaultProvider: false }),
    ];
  });
  const configFile = findConfigFile(root);
  nuxt.hook('nitro:config', (config) => {
    // useEvent() of the binding needs the async context of Nitro
    config.experimental = { ...config.experimental, asyncContext: true };
    // The aliases only reach the SDK when Nitro bundles it
    config.externals = {
      ...config.externals,
      inline: [...(config.externals?.inline ?? []), 'flags', '@flags-sdk/nuxt'],
    };
    config.alias = {
      ...config.alias,
      'flags/framework': ownModule('binding'),
      ...(configFile ? { 'flags/config': configFile } : {}),
      ...(defaultProvider
        ? { 'flags/default-provider': resolve(defaultProvider) }
        : {}),
    };
    config.plugins = [...(config.plugins ?? []), ownModule('plugin')];
    config.rollupConfig ??= {};
    config.rollupConfig.plugins = [
      ...asArray(config.rollupConfig.plugins),
      // In development, Nitro also builds, but without a manifest
      flags({ root, manifest: !nuxt.options.dev, defaultProvider: false }),
    ];
  });
}

/**
 * Nuxt reads the metadata of a module from this property.
 */
flagsNuxtModule.meta = { name: '@flags-sdk/nuxt', configKey: 'flags' };
