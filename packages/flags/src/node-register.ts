/**
 * Lets Node.js import flags files, for applications without a bundler, e.g.
 * Hono or Express:
 *
 * ```sh
 * node --import flags/register server.ts
 * ```
 *
 * ```ts
 * import { summerSale } from './app.flags';
 * ```
 *
 * A flags file becomes the same module as with a framework plugin: one
 * `defineSource` and one `source.bindFlag` for each flag, and the flags
 * register themselves. It also writes the declaration file next to the
 * flags file, e.g. `app.d.flags.ts`, for the editors and for `tsc`. It
 * needs `module.registerHooks` (Node.js 22.15 or newer). Relative imports
 * without an extension work, as in a bundler, e.g. in `provider.ts`.
 */
import { readFileSync } from 'node:fs';
import nodeModule from 'node:module';
import { fileURLToPath } from 'node:url';
import { compileFlagsFile, findProjectDirectory } from './flags-file/compile';
import { writeFlagsFileDeclaration } from './flags-file/declarations';
import { FLAGS_FILE_EXTENSION } from './flags-file/document';

interface LoadResult {
  format?: string;
  source?: string | ArrayBuffer | Uint8Array;
  shortCircuit?: boolean;
}

type ResolveHook = (
  specifier: string,
  context: unknown,
  nextResolve: (specifier: string, context?: unknown) => unknown,
) => unknown;

type LoadHook = (
  url: string,
  context: unknown,
  nextLoad: (url: string, context?: unknown) => LoadResult,
) => LoadResult;

const { registerHooks } = nodeModule as {
  registerHooks?: (hooks: {
    resolve?: ResolveHook;
    load?: LoadHook;
  }) => unknown;
};

if (!registerHooks) {
  throw new Error(
    'flags/register needs module.registerHooks of Node.js 22.15 or newer.',
  );
}

const relative = (specifier: string) =>
  specifier.startsWith('./') || specifier.startsWith('../');

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code;
      if (
        !relative(specifier) ||
        /\.[a-z]+$/i.test(specifier) ||
        (code !== 'ERR_MODULE_NOT_FOUND' &&
          code !== 'ERR_UNSUPPORTED_DIR_IMPORT')
      ) {
        throw error;
      }
      for (const suffix of ['.ts', '.tsx', '/index.ts']) {
        try {
          return nextResolve(`${specifier}${suffix}`, context);
        } catch {
          // Try the next suffix
        }
      }
      throw error;
    }
  },
  load(url, context, nextLoad) {
    if (
      !url.startsWith('file:') ||
      !url.split('?')[0]?.endsWith(FLAGS_FILE_EXTENSION)
    ) {
      return nextLoad(url, context);
    }
    const fileName = fileURLToPath(url);
    const text = readFileSync(fileName, 'utf8');
    const projectDirectory = findProjectDirectory(fileName);
    const { code, warnings } = compileFlagsFile(text, {
      fileName,
      projectDirectory,
    });
    for (const warning of warnings) {
      console.warn(`flags: ${fileName}: ${warning.message}`);
    }
    try {
      writeFlagsFileDeclaration(fileName, text, projectDirectory);
    } catch {
      // The types are a convenience, the module is what counts
    }
    return { format: 'module', source: code, shortCircuit: true };
  },
});
