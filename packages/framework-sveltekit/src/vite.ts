import { createHash } from 'node:crypto';
import { rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createManifest } from 'flags/manifest';
import {
  findFlagsModules,
  hasUseFlagsDirective,
  MANIFEST_FILE,
  writeManifestFromBuild,
} from 'flags/tooling';
import type { Plugin, ViteDevServer } from 'vite';

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
 * The path of the manifest in development.
 */
export const MANIFEST_PATH = '/.well-known/flags/manifest.json';

const sourceFile = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

/**
 * Replaces the directive with spaces. The bundler would warn about an
 * unknown directive, and the positions in the module stay the same.
 */
function removeDirective(code: string): string {
  return code.replace(/(['"])use flags\1/, (match) => ' '.repeat(match.length));
}

interface EnvironmentContext {
  readonly environment?: { readonly config?: { readonly consumer?: string } };
}

function isServer(context: EnvironmentContext): boolean {
  return context.environment?.config?.consumer === 'server';
}

/**
 * Imports a server module in the dev server, through the SSR environment of
 * Vite, so that the aliases of SvelteKit and of this plugin apply.
 */
function importForServer(
  server: ViteDevServer,
  file: string,
): Promise<Record<string, unknown>> {
  const runner = (
    server.environments?.ssr as
      | { runner?: { import(url: string): Promise<unknown> } }
      | undefined
  )?.runner;
  if (runner) {
    return runner.import(file) as Promise<Record<string, unknown>>;
  }
  return server.ssrLoadModule(file);
}

/**
 * Connects the Flags SDK to SvelteKit:
 *
 * - It points the alias `flags/framework` to the binding of SvelteKit, so
 *   that a flag gets the current request from `getRequestEvent()` of
 *   `$app/server`.
 * - The manifest of the flags in the modules with the `'use flags'`
 *   directive, e.g. for Flags Explorer: in development at
 *   `/.well-known/flags/manifest.json`, and after a build as
 *   `flags-manifest.json` in the directory of the server output.
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
  let root = process.cwd();
  let isBuild = false;
  // The emitted chunk of each module with 'use flags', by its id
  const chunks = new Map<string, string>();

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
    configResolved(config) {
      root = config.root;
      isBuild = config.command === 'build';
    },
    transform(code, id) {
      const file = id.split('?')[0] ?? id;
      if (
        file.includes('/node_modules/') ||
        !sourceFile.test(file) ||
        !code.includes('use flags') ||
        !hasUseFlagsDirective(code)
      ) {
        return null;
      }
      return { code: removeDirective(code), map: null };
    },
    buildStart() {
      chunks.clear();
      if (!isBuild || !isServer(this)) {
        return;
      }
      // Each module becomes its own chunk with all its exports, so that the
      // manifest can import it after the build
      for (const id of findFlagsModules(root)) {
        const hash = createHash('sha256').update(id).digest('hex').slice(0, 8);
        chunks.set(
          id,
          this.emitFile({
            type: 'chunk',
            id: join(root, id),
            name: `flags-${hash}`,
            preserveSignature: 'strict',
          }),
        );
      }
    },
    async writeBundle(output) {
      if (chunks.size === 0 || !output.dir) {
        return;
      }
      const dir = output.dir;
      const file = join(dir, MANIFEST_FILE);
      rmSync(file, { force: true });
      await writeManifestFromBuild({
        projectDir: root,
        modules: [...chunks].map(([id, reference]) => ({
          id,
          file: resolve(dir, this.getFileName(reference)),
        })),
        output: file,
      });
    },
    // Before the middleware of SvelteKit, which answers each path
    configureServer: {
      order: 'pre',
      handler(server) {
        server.middlewares.use(async (request, response, next) => {
          if (request.url?.split('?')[0] !== MANIFEST_PATH) {
            next();
            return;
          }
          try {
            const modules = await Promise.all(
              findFlagsModules(root).map(async (id) => ({
                id,
                exports: { ...(await importForServer(server, join(root, id))) },
              })),
            );
            response.setHeader('content-type', 'application/json');
            response.setHeader('cache-control', 'no-store');
            response.end(JSON.stringify(createManifest(modules)));
          } catch (error) {
            next(error);
          }
        });
      },
    },
  };
}
