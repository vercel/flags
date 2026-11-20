/**
 * The code generation of `flags:<source>` for the plugins of Vite and Nuxt.
 * It runs `generateFlags` or `watchFlags` of `flags/tooling` before the
 * bundler resolves the imports, and turns the generated modules into
 * aliases.
 */
import { join } from 'node:path';
import {
  type FlagsAliases,
  type GenerateOptions,
  generateFlags,
  watchFlags,
} from 'flags/tooling';

export interface CodeGeneration {
  /**
   * Resolves with the aliases when the first modules exist.
   */
  readonly ready: Promise<FlagsAliases>;
  /**
   * Stops the watch of the catalogs.
   */
  stop(): void;
}

// A config can be loaded more than once in one process, also after a reload
// of this module. One generation for each directory and mode.
const registryKey = Symbol.for('@flags-sdk/vite/code-generation');
const store = globalThis as typeof globalThis & {
  [registryKey]?: Map<string, CodeGeneration>;
};
store[registryKey] ??= new Map();
const generations = store[registryKey];

/**
 * Generates the modules of `flags:<source>` from the catalogs of
 * `flags/sources`: one time (`watch: false`, for a build), or again after
 * each change of a catalog (`watch: true`, for a dev server).
 */
export function startCodeGeneration(
  dir: string,
  watch: boolean,
  options: GenerateOptions = {},
): CodeGeneration {
  const key = `${watch ? 'watch' : 'build'}:${dir}`;
  const existing = generations.get(key);
  if (existing) {
    return existing;
  }
  const controller = new AbortController();
  const remove = () => {
    if (generations.get(key) === generation) {
      generations.delete(key);
    }
  };
  const ready = watch
    ? watchFlags(dir, { ...options, signal: controller.signal }).then(
        (result) => {
          result.done
            .catch((error: unknown) => {
              console.error(
                'flags: The watch of the catalogs stopped. Restart the dev server.',
                error,
              );
            })
            .finally(remove);
          return result.aliases;
        },
      )
    : // A later build generates again
      generateFlags(dir, options).finally(remove);
  const generation: CodeGeneration = {
    ready,
    stop: () => {
      controller.abort();
      remove();
    },
  };
  ready.catch(remove);
  generations.set(key, generation);
  return generation;
}

/**
 * The aliases of the generated modules, as absolute paths, e.g.
 * `{ 'flags:self': '/app/.flags/self.ts' }`.
 */
export function resolveAliases(
  dir: string,
  aliases: FlagsAliases,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(aliases).map(([name, path]) => [name, join(dir, path)]),
  );
}
