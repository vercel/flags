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
 *   with `useEvent()`, and `flags/config.ts`. The module sets
 *   `experimental.asyncContext` of Nitro for it.
 * - A Nitro plugin calls `runtime.onInit` and `runtime.onShutdown`.
 * - The modules of `flags:<source>`, generated from the catalogs of
 *   `flags/sources`, for Vite and Nitro, unless `disableCodeGeneration` is
 *   set.
 *
 * It is a plain function and uses only hooks of Nuxt, so that the SDK does
 * not depend on `@nuxt/kit`.
 */
import { fileURLToPath } from 'node:url';
import { flags, resolveAliases, startCodeGeneration } from '@flags-sdk/vite';
import { findConfigModules, findGeneratedDeclarations } from 'flags/tooling';

type Plugins = unknown[] | unknown;

interface NitroConfig {
  rollupConfig?: { plugins?: Plugins };
  alias?: Record<string, string>;
  externals?: { inline?: (string | RegExp)[] };
  experimental?: { asyncContext?: boolean };
  plugins?: string[];
}

interface ViteConfig {
  plugins?: unknown[];
  resolve?: { alias?: unknown };
}

interface Nuxt {
  readonly options: {
    readonly rootDir: string;
    readonly dev: boolean;
  };
  hook(name: 'vite:extendConfig', callback: (config: ViteConfig) => void): void;
  hook(name: 'nitro:config', callback: (config: NitroConfig) => void): void;
  hook(name: 'close', callback: () => void): void;
  hook(
    name: 'prepare:types',
    callback: (options: { references: { path?: string }[] }) => void,
  ): void;
}

export interface FlagsNuxtOptions {
  /**
   * Turns off the code generation of `flags:<source>`. By default, the
   * module generates the modules from the catalogs of
   * `flags/sources/<source>`: one time for a build, and again after each
   * change of a catalog for `nuxt dev`. Without `flags/sources`, it writes
   * nothing.
   *
   * ```ts
   * modules: [['@flags-sdk/nuxt', { disableCodeGeneration: true }]]
   * ```
   */
  readonly disableCodeGeneration?: boolean;
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

/**
 * Adds an alias to the aliases of Vite, which can be an object or an array.
 */
function withAliases(
  existing: unknown,
  aliases: Record<string, string>,
): unknown {
  if (Array.isArray(existing)) {
    return [
      ...existing,
      ...Object.entries(aliases).map(([find, replacement]) => ({
        find,
        replacement,
      })),
    ];
  }
  return { ...(existing as Record<string, string> | undefined), ...aliases };
}

export default async function flagsNuxtModule(
  options: FlagsNuxtOptions | undefined,
  nuxt: Nuxt,
): Promise<void> {
  const root = nuxt.options.rootDir;
  let aliases: Record<string, string> = {};
  if (!options?.disableCodeGeneration) {
    const generation = startCodeGeneration(root, nuxt.options.dev);
    nuxt.hook('close', () => generation.stop());
    aliases = resolveAliases(root, await generation.ready);
    // The types of flags:<source>: the declarations in the folder flags,
    // as a reference of the types of Nuxt. Not an alias of Nuxt, which
    // would point TypeScript to the generated module instead.
    const declarations = await findGeneratedDeclarations(root);
    if (declarations) {
      nuxt.hook('prepare:types', ({ references }) => {
        references.push({ path: declarations });
      });
    }
  }

  nuxt.hook('vite:extendConfig', (config) => {
    config.plugins = [
      ...(config.plugins ?? []),
      // Nitro bundles the server code again, with the binding
      flags({ root, manifest: false, disableCodeGeneration: true }),
    ];
    config.resolve = {
      ...config.resolve,
      alias: withAliases(config.resolve?.alias, aliases),
    };
  });
  // flags/hooks.ts, flags/overrides.ts and flags/config.json, for the binding
  const configModules = findConfigModules(root);
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
      ...configModules,
      ...aliases,
    };
    config.plugins = [...(config.plugins ?? []), ownModule('plugin')];
    config.rollupConfig ??= {};
    config.rollupConfig.plugins = [
      ...asArray(config.rollupConfig.plugins),
      // In development, Nitro also builds, but without a manifest
      flags({
        root,
        manifest: !nuxt.options.dev,
        disableCodeGeneration: true,
      }),
    ];
  });
}

/**
 * Nuxt reads the metadata of a module from this property.
 */
flagsNuxtModule.meta = { name: '@flags-sdk/nuxt', configKey: 'flags' };
