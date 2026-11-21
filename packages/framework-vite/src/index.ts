/**
 * The Vite plugin of the Flags SDK, for the framework packages, e.g.
 * `@flags-sdk/sveltekit/vite`. An application uses the plugin of its
 * framework package. It uses the bundler of the framework for:
 *
 * - The framework binding behind `flags/framework`, and `flags/config.ts`
 *   behind `flags/config`.
 * - A module with the `'use flags'` directive registers its flags itself,
 *   so nobody calls `registerFlags` by hand.
 * - The manifest of the flags, e.g. for Flags Explorer: in development at
 *   `/.well-known/flags/manifest.json`, and after a build as
 *   `flags-manifest.json` in the directory of the server output.
 * - Flags files (`*.flags`): each becomes a module of its flags, with the
 *   source of its `source` (see "Flags files" in the spec of `flags`).
 * - The modules of `flags:<source>`, generated from the catalogs of
 *   `flags/sources`, unless `disableCodeGeneration` is set. An application
 *   with flags files uses no catalogs.
 *
 * It is also a Rollup plugin, e.g. for the server build of Nitro.
 */
import { createHash } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { createManifest } from 'flags/manifest';
import { runtime } from 'flags/runtime';
import {
  addSelfRegistration,
  compileFlagsFile,
  declarationFileOf,
  FLAGS_FILE_EXTENSION,
  findConfigModules,
  findFlagsModules,
  hasUseFlagsDirective,
  MANIFEST_FILE,
  renderFlagsFileTypes,
  sourceDirectoryCandidates,
  usesContentMapper,
  writeManifestFromBuild,
} from 'flags/tooling';
import type { Plugin, ViteDevServer } from 'vite';
import {
  type CodeGeneration,
  resolveAliases,
  startCodeGeneration,
} from './code-generation';

export { resolveAliases, startCodeGeneration } from './code-generation';

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
  /**
   * The framework binding: the module behind `flags/framework`, e.g.
   * `@flags-sdk/sveltekit/binding`. With it, the plugin also points
   * `flags/config` to `flags/config.ts`, so that the SDK gets the request
   * and the configuration without code in the application. A framework
   * package sets it.
   */
  readonly binding?: string;
  /**
   * More packages to bundle into the server code, e.g. the package of the
   * binding. `flags` is always bundled when there is a binding.
   */
  readonly bundle?: readonly string[];
  /**
   * Packages which the binding imports, and which must be the copy of the
   * project, e.g. `@sveltejs/kit`. A second copy would not recognize the
   * objects of the first, e.g. with `instanceof`. Uses `resolve.dedupe` of
   * Vite.
   */
  readonly dedupe?: readonly string[];
  /**
   * Modules which the binding imports, and which the plugin resolves from
   * the project, by the first module which the project has. E.g.
   * `{ 'flags:tanstack-start/server': ['@tanstack/react-start/server',
   * '@tanstack/solid-start/server'] }`.
   */
  readonly projectModules?: Readonly<Record<string, readonly string[]>>;
  /**
   * Turns off the code generation of `flags:<source>`. By default, the
   * plugin generates the modules from the catalogs of
   * `flags/sources/<source>`: one time for a build, and again after each
   * change of a catalog for the dev server, and points the aliases
   * `flags:<source>` to them. Without `flags/sources`, it writes nothing.
   */
  readonly disableCodeGeneration?: boolean;
}

/**
 * The path of the manifest in development.
 */
export const MANIFEST_PATH = '/.well-known/flags/manifest.json';

const sourceFile = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

/**
 * Writes the declaration file of a flags file for TypeScript before 7.1,
 * e.g. `app.d.flags.ts`, if it changed.
 */
function writeFlagsFileDeclarations(file: string, text: string, root: string) {
  if (usesContentMapper(root)) {
    return;
  }
  const declaration = declarationFileOf(file);
  const types = renderFlagsFileTypes(text, {
    fileName: file,
    projectDirectory: root,
  }).text;
  let previous: string | undefined;
  try {
    previous = readFileSync(declaration, 'utf8');
  } catch {
    previous = undefined;
  }
  if (previous !== types) {
    writeFileSync(declaration, types);
  }
}

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

interface DevImporter {
  import(url: string): Promise<Record<string, unknown>>;
  refresh?(): void;
}

// The runnable copy of the SSR environment of each dev server
const copies = new WeakMap<ViteDevServer, Promise<DevImporter>>();

/**
 * Returns a way to import server modules in development. The SSR
 * environment of Vite is runnable in most frameworks. With a framework which
 * runs it elsewhere, e.g. TanStack Start with Nitro in a worker, a runnable
 * copy of the SSR environment imports the modules.
 *
 * The copy stays open as long as the dev server: the runtime keeps the
 * loader of flags/config.ts of the copy as its config loader. Each manifest
 * clears its modules first, so it imports the current files. `vite` is only
 * loaded when it is necessary.
 */
function devImporter(server: ViteDevServer): Promise<DevImporter> {
  const ssr = server.environments?.ssr as
    | ({ runner?: DevImporter } & object)
    | undefined;
  if (ssr?.runner) return Promise.resolve(ssr.runner);
  if (!ssr) {
    return Promise.resolve({
      import: (file) =>
        server.ssrLoadModule(file) as Promise<Record<string, unknown>>,
    });
  }
  let copy = copies.get(server);
  if (!copy) {
    copy = (async () => {
      const { createRunnableDevEnvironment } = await import('vite');
      const environment = createRunnableDevEnvironment('ssr', server.config);
      await environment.init({ watcher: server.watcher });
      server.httpServer?.once('close', () => void environment.close());
      return {
        import: (url: string) =>
          environment.runner.import(url) as Promise<Record<string, unknown>>,
        // Vite does not invalidate the copy when a file changes, because it
        // is not an environment of the server. Each manifest starts fresh.
        refresh: () => {
          environment.moduleGraph.invalidateAll();
          environment.runner.clearCache();
        },
      };
    })();
    copies.set(server, copy);
  }
  return copy;
}

export function flags(options: FlagsVitePluginOptions = {}): Plugin {
  let root = options.root ?? process.cwd();
  let generation: CodeGeneration | undefined;
  // Vite calls configResolved. Rollup does not, and then it is a build.
  let vite = false;
  let isBuild = true;
  // The emitted chunk of each module with 'use flags', by its id
  const chunks = new Map<string, string>();

  return {
    name: 'flags',
    async config(config, env) {
      const dir = resolve(options.root ?? config.root ?? process.cwd());
      let aliases: Record<string, string> = {};
      // As a plain Rollup plugin, e.g. in Nitro, there is no config hook, so
      // a framework module generates the code itself
      if (!options.disableCodeGeneration) {
        generation = startCodeGeneration(dir, env.command === 'serve');
        aliases = resolveAliases(dir, await generation.ready);
      }
      if (!options.binding && Object.keys(aliases).length === 0) return;
      const configModules = options.binding ? findConfigModules(dir) : {};
      // The modules behind the aliases only reach the SDK when it is bundled
      // into the server code, not when Node.js loads it from node_modules.
      // The optimizer of dependencies must not bundle these packages in
      // advance: the modules of the framework which a binding imports only
      // work in the framework.
      const bundled = ['flags', ...(options.bundle ?? [])];
      return {
        resolve: {
          alias: [
            // flags/hooks.ts and flags/config.json
            ...Object.entries(configModules).map(([module, file]) => ({
              find: new RegExp(`^${module}$`),
              replacement: file,
            })),
            ...Object.entries(aliases).map(([find, replacement]) => ({
              find,
              replacement,
            })),
          ],
          dedupe: [...(options.dedupe ?? [])],
        },
        ssr: { noExternal: bundled, optimizeDeps: { exclude: bundled } },
        optimizeDeps: { exclude: bundled },
      };
    },
    // Resolves the modules which the SDK imports, but which only the project
    // has: the binding, and the modules of the framework. Before the
    // resolver of Vite, which resolves flags/framework through the exports
    // of the package.
    resolveId: {
      order: 'pre',
      async handler(id) {
        const importer = join(root, 'package.json');
        if (id === 'flags/framework' && options.binding) {
          return this.resolve(options.binding, importer, { skipSelf: true });
        }
        for (const candidate of options.projectModules?.[id] ?? []) {
          const resolved = await this.resolve(candidate, importer, {
            skipSelf: true,
          });
          if (resolved) return resolved;
        }
        return null;
      },
    },
    configResolved(config) {
      vite = true;
      root = options.root ?? config.root;
      isBuild = config.command === 'build';
    },
    transform(code, id, transformOptions) {
      const file = id.split('?')[0] ?? id;
      // A flags file becomes a module with defineSource and source.bindFlag
      if (
        file.endsWith(FLAGS_FILE_EXTENSION) &&
        !file.includes('/node_modules/')
      ) {
        const compiled = compileFlagsFile(code, {
          fileName: file,
          projectDirectory: root,
        });
        for (const directory of sourceDirectoryCandidates(
          root,
          compiled.document.source,
        )) {
          for (const part of ['provider', 'context', 'hooks']) {
            this.addWatchFile(join(directory, `${part}.ts`));
          }
        }
        for (const warning of compiled.warnings) {
          this.warn(`flags: ${file}: ${warning.message}`);
        }
        try {
          writeFlagsFileDeclarations(file, code, root);
        } catch {
          // The types are a convenience, the module is what counts
        }
        return { code: compiled.code, map: null };
      }
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
    // Before the middlewares of the framework, which can answer each path,
    // e.g. TanStack Start
    configureServer: {
      order: 'pre',
      handler(server) {
        // The watch of the catalogs ends with the dev server
        server.httpServer?.once('close', () => generation?.stop());
        server.middlewares.use(async (request, response, next) => {
          if (request.url?.split('?')[0] !== MANIFEST_PATH) return next();
          try {
            const load = await devImporter(server);
            load.refresh?.();
            if (options.binding) {
              // The SDK in the server code has the framework binding, so the
              // runtime can load flags/hooks.ts and flags/config.json
              await load.import('flags');
              await runtime.prepare();
            }
            const modules = await Promise.all(
              findFlagsModules(root).map(async (id) => ({
                id,
                exports: { ...(await load.import(join(root, id))) },
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
