/**
 * The Vite plugin of the Flags SDK, for the framework packages, e.g.
 * `@flags-sdk/sveltekit/vite`. An application uses the plugin of its
 * framework package. It uses the bundler of the framework for:
 *
 * - The framework binding behind `flags/framework`, and `flags.config.ts`
 *   behind `flags/config`.
 * - A module with the `'use flags'` directive registers its flags itself,
 *   so nobody calls `registerFlags` by hand.
 * - The manifest of the flags, e.g. for Flags Explorer: in development at
 *   `/.well-known/flags/manifest.json`, and after a build as
 *   `flags-manifest.json` in the directory of the server output.
 * - The default provider of the platform, e.g. on Vercel.
 *
 * It is also a Rollup plugin, e.g. for the server build of Nitro.
 */
import { createHash } from 'node:crypto';
import { rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, join, resolve } from 'node:path';
import { runtime } from 'flags';
import { createManifest } from 'flags/manifest';
import {
  addSelfRegistration,
  findConfigFile,
  findFlagsModules,
  hasUseFlagsDirective,
  MANIFEST_FILE,
  writeManifestFromBuild,
} from 'flags/tooling';
import type { Plugin, ViteDevServer } from 'vite';

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
   * `flags/config` to `flags.config.ts`, so that the SDK gets the request
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
   * The module of the default provider, e.g. of a platform, instead of the
   * built-in OFREP provider (see `flags/default-provider`). A path is
   * relative to the project. During a build on Vercel (`VERCEL` is set),
   * the default is `@vercel/flags-core/default-provider`, if the project
   * has `@vercel/flags-core`. `false` turns this off.
   */
  readonly defaultProvider?: string | false;
}

const VERCEL_DEFAULT_PROVIDER = '@vercel/flags-core/default-provider';

/**
 * The default provider of the platform of the build: on Vercel, the fast
 * provider of `@vercel/flags-core`, if the project has it. Development uses
 * OFREP, as with the deployment adapters of Next.js.
 */
export function platformDefaultProvider(
  dir: string,
  isBuild: boolean,
  // Throws if the project does not have the module
  resolveModule: (id: string) => unknown = (id) =>
    createRequire(join(dir, 'package.json')).resolve(id),
): string | undefined {
  if (!isBuild || !process.env.VERCEL) return undefined;
  try {
    resolveModule(VERCEL_DEFAULT_PROVIDER);
    return VERCEL_DEFAULT_PROVIDER;
  } catch {
    return undefined;
  }
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

interface DevImporter {
  import(url: string): Promise<Record<string, unknown>>;
  close?(): Promise<void>;
}

/**
 * Returns a way to import server modules in development. The SSR
 * environment of Vite is runnable in most frameworks. With a framework which
 * runs it elsewhere, e.g. TanStack Start with Nitro in a worker, a runnable
 * copy of the SSR environment imports the modules. It is new for each
 * request, so that it imports the current files, and `vite` is only loaded
 * when it is necessary.
 */
async function devImporter(
  server: ViteDevServer,
): Promise<{ importer: DevImporter; own: boolean }> {
  const ssr = server.environments?.ssr as
    | ({ runner?: DevImporter } & object)
    | undefined;
  if (ssr?.runner) return { importer: ssr.runner, own: false };
  if (ssr) {
    // A runnable copy of the SSR environment, with its configuration and
    // plugins, only for this request
    const { createRunnableDevEnvironment } = await import('vite');
    const environment = createRunnableDevEnvironment('ssr', server.config, {
      hot: false,
    });
    await environment.init({ watcher: server.watcher });
    return {
      importer: {
        import: (url) =>
          environment.runner.import(url) as Promise<Record<string, unknown>>,
        close: () => environment.close(),
      },
      own: true,
    };
  }
  return {
    importer: {
      import: (file) =>
        server.ssrLoadModule(file) as Promise<Record<string, unknown>>,
    },
    own: false,
  };
}

export function flags(options: FlagsVitePluginOptions = {}): Plugin {
  let root = options.root ?? process.cwd();
  let defaultProvider: string | undefined;
  // Vite calls configResolved. Rollup does not, and then it is a build.
  let vite = false;
  let isBuild = true;
  // The emitted chunk of each module with 'use flags', by its id
  const chunks = new Map<string, string>();

  return {
    name: 'flags',
    config(config, env) {
      const dir = options.root ?? config.root ?? process.cwd();
      defaultProvider =
        options.defaultProvider === false
          ? undefined
          : (options.defaultProvider ??
            platformDefaultProvider(dir, env.command === 'build'));
      if (!options.binding && !defaultProvider) return;
      const configFile = options.binding ? findConfigFile(dir) : undefined;
      // The modules behind the aliases only reach the SDK when it is bundled
      // into the server code, not when Node.js loads it from node_modules.
      // The optimizer of dependencies must not bundle these packages in
      // advance: the modules of the framework which a binding imports only
      // work in the framework.
      const bundled = ['flags', ...(options.bundle ?? [])];
      return {
        resolve: {
          alias: configFile
            ? [{ find: /^flags\/config$/, replacement: configFile }]
            : [],
          dedupe: [...(options.dedupe ?? [])],
        },
        ssr: { noExternal: bundled, optimizeDeps: { exclude: bundled } },
        optimizeDeps: { exclude: bundled },
      };
    },
    // Resolves the modules which the SDK imports, but which only the project
    // has: the binding, the modules of the framework, and the default
    // provider. Before
    // the resolver of Vite, which resolves flags/default-provider through
    // the exports of the package.
    resolveId: {
      order: 'pre',
      async handler(id) {
        const importer = join(root, 'package.json');
        if (id === 'flags/framework' && options.binding) {
          return this.resolve(options.binding, importer, { skipSelf: true });
        }
        if (id === 'flags/default-provider' && defaultProvider) {
          return this.resolve(defaultProvider, importer, { skipSelf: true });
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
        server.middlewares.use(async (request, response, next) => {
          if (request.url?.split('?')[0] !== MANIFEST_PATH) return next();
          const { importer, own } = await devImporter(server);
          try {
            if (options.binding) {
              // The SDK in the server code has the framework binding, so the
              // runtime can load flags.config.ts, which gives the default
              // connection of the flags without a connection
              await importer.import('flags');
              await runtime.prepare();
            }
            const modules = await Promise.all(
              findFlagsModules(root).map(async (id) => ({
                id,
                exports: { ...(await importer.import(join(root, id))) },
              })),
            );
            response.setHeader('content-type', 'application/json');
            response.setHeader('cache-control', 'no-store');
            response.end(JSON.stringify(createManifest(modules)));
          } catch (error) {
            next(error);
          } finally {
            if (own) await importer.close?.();
          }
        });
      },
    },
  };
}
