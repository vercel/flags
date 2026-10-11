/**
 * The Vite plugin of the Flags SDK, e.g. for SvelteKit. It uses the bundler
 * of the framework for two things:
 *
 * - A module with the `'use flags'` directive registers its flags itself,
 *   so nobody calls `registerFlags` by hand.
 * - The manifest of the flags, e.g. for Flags Explorer: in development at
 *   `/.well-known/flags/manifest.json`, and after a build as
 *   `flags-manifest.json` in the directory of the server output.
 *
 * ```ts
 * // vite.config.ts
 * import { flags } from 'flags/vite';
 *
 * export default defineConfig({ plugins: [sveltekit(), flags()] });
 * ```
 *
 * It is also a Rollup plugin, e.g. for the server build of Nitro.
 */
import { createHash } from 'node:crypto';
import { rmSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';
import { MANIFEST_FILE, writeManifestFromBuild } from './build-manifest';
import { hasUseFlagsDirective } from './directive';
import { findFlagsModules } from './find-flags-modules';
import { createManifest } from './manifest';
import { addSelfRegistration } from './self-registration';

export interface FlagsVitePluginOptions {
  /**
   * The directory of the project, where the plugin looks for modules with
   * `'use flags'`. The default is the root of Vite.
   */
  readonly root?: string;
  /**
   * Whether a build writes `flags-manifest.json`. The default is `true`. A
   * framework with two builds of the server, e.g. Nuxt with Vite and Nitro,
   * writes it in one of them.
   */
  readonly manifest?: boolean;
}

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

function isServer(
  context: EnvironmentContext,
  ssr: boolean | undefined,
  vite: boolean,
) {
  // As a plain Rollup plugin, e.g. in Nitro, it only builds server code
  if (!vite) return true;
  const consumer = context.environment?.config?.consumer;
  return consumer ? consumer === 'server' : ssr === true;
}

async function importForDev(server: ViteDevServer, file: string) {
  const ssr = server.environments?.ssr as
    | { runner?: { import(url: string): Promise<Record<string, unknown>> } }
    | undefined;
  return ssr?.runner
    ? ssr.runner.import(file)
    : (server.ssrLoadModule(file) as Promise<Record<string, unknown>>);
}

export function flags(options: FlagsVitePluginOptions = {}): Plugin {
  let root = options.root ?? process.cwd();
  // Vite calls configResolved. Rollup does not, and then it is a build.
  let vite = false;
  let isBuild = true;
  // The emitted chunk of each module with 'use flags', by its id
  const chunks = new Map<string, string>();

  return {
    name: 'flags',
    configResolved(config) {
      vite = true;
      root = options.root ?? config.root;
      isBuild = config.command === 'build';
    },
    transform(code, id, transformOptions) {
      const file = id.split('?')[0] ?? id;
      if (
        !isServer(this, transformOptions?.ssr, vite) ||
        file.includes('/node_modules/') ||
        !sourceFile.test(file) ||
        !code.includes('use flags') ||
        !hasUseFlagsDirective(code)
      ) {
        return null;
      }
      return {
        code: addSelfRegistration(removeDirective(code), basename(file)),
        map: null,
      };
    },
    buildStart() {
      chunks.clear();
      if (
        options.manifest === false ||
        !isBuild ||
        !isServer(this, undefined, vite)
      ) {
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
      if (chunks.size === 0 || !output.dir) return;
      const file = join(output.dir, MANIFEST_FILE);
      rmSync(file, { force: true });
      await writeManifestFromBuild({
        projectDir: root,
        modules: [...chunks].map(([id, reference]) => ({
          id,
          file: resolve(output.dir as string, this.getFileName(reference)),
        })),
        output: file,
      });
    },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (request.url?.split('?')[0] !== MANIFEST_PATH) return next();
        try {
          const modules = await Promise.all(
            findFlagsModules(root).map(async (id) => ({
              id,
              exports: { ...(await importForDev(server, join(root, id))) },
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
  };
}
