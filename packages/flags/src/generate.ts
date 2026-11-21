/**
 * The code generation of `flags:<source>`. It reads the catalogs of
 * `flags/sources/<source>/catalog.ts`, and writes one module for each
 * source into `.flags/<source>.ts`. A framework plugin points the alias
 * `flags:<source>` to the module. TypeScript finds the types in
 * `flags/generated.d.ts`.
 *
 * An application which depends on `@vercel/flags-core` has the default
 * source `self`: the flags of its Vercel project. Each file which
 * `flags/sources/self/` does not have comes from `@vercel/flags-core`.
 *
 * It imports only the catalogs, never the providers or the contexts.
 */
import { randomUUID } from 'node:crypto';
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import nodeModule from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Catalog, CatalogLoader } from './catalog';
import {
  assertSourceName,
  renderDeclarations,
  renderSourceModule,
  type SourceFiles,
} from './codegen';
import { readSettings } from './config-file';
import { findFlagsFiles } from './find-flags-modules';
import {
  watchFlagsFileDeclarations,
  writeFlagsFileDeclarations,
} from './flags-file/declarations';
import { GENERATED_DIRECTORY } from './generated-directory';

export { GENERATED_DIRECTORY };

/**
 * The aliases of the generated modules, e.g.
 * `{ 'flags:site': './.flags/site.ts' }`. Relative to the directory of the
 * application.
 */
export type FlagsAliases = Record<string, string>;

// context.ts is optional: without it, the source has no evaluation context
const CATALOG_FILE = 'catalog.ts';
const PROVIDER_FILE = 'provider.ts';
const CONTEXT_FILE = 'context.ts';
const HOOKS_FILE = 'hooks.ts';

/**
 * The default source, and the package which gives its provider and catalog.
 */
const SELF_SOURCE = 'self';
const VERCEL_FLAGS_PACKAGE = '@vercel/flags-core';
const VERCEL_CATALOG_MODULE = '@vercel/flags-core/catalog';

/**
 * A source, and where each of its parts comes from.
 */
interface SourcePlan {
  readonly name: string;
  /** `catalog.ts` of the source, or the catalog of Vercel Flags */
  readonly catalog: 'file' | 'vercel';
  readonly provider: 'file' | 'vercel';
}

async function isFile(file: string): Promise<boolean> {
  const info = await stat(file).catch(() => null);
  return info?.isFile() ?? false;
}

async function writeIfChanged(
  directory: string,
  filename: string,
  content: string,
): Promise<void> {
  const target = path.join(directory, filename);
  const previous = await readFile(target, 'utf8').catch(() => null);
  if (previous === content) {
    return;
  }
  // A file watcher must never see a module which is only partly written
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content);
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

/**
 * The name of the declarations of the modules `flags:<source>`, in the
 * folder `flags` of the application.
 */
export const GENERATED_DECLARATIONS = 'generated.d.ts';

/**
 * Finds the folder `flags` with the sources: in the directory of the
 * application, or in its `src` directory, as for `flags/config.ts`. The SDK
 * never creates this folder, so it is where the application put it.
 */
export async function findFlagsDirectory(
  directory: string,
): Promise<string | undefined> {
  for (const base of [directory, path.join(directory, 'src')]) {
    const flags = path.join(base, 'flags');
    const info = await stat(path.join(flags, 'sources')).catch(() => null);
    if (info?.isDirectory()) {
      return flags;
    }
  }
  return undefined;
}

/**
 * Finds `flags/generated.d.ts`, the types of `flags:<source>`, which the
 * code generation wrote: in the directory of the application, or in its
 * `src` directory. Also for the default source `self` without a folder
 * `flags/sources`.
 */
export async function findGeneratedDeclarations(
  directory: string,
): Promise<string | undefined> {
  for (const base of [directory, path.join(directory, 'src')]) {
    const file = path.join(base, 'flags', GENERATED_DECLARATIONS);
    if (await isFile(file)) {
      return file;
    }
  }
  return undefined;
}

/**
 * Where the folder `flags` goes for the default source, if the application
 * has none: into `src`, if the application has `src`, as for SvelteKit.
 */
async function defaultFlagsDirectory(directory: string): Promise<string> {
  // A folder flags which exists, e.g. with flags/config.ts, comes first
  for (const base of [directory, path.join(directory, 'src')]) {
    const flags = path.join(base, 'flags');
    const info = await stat(flags).catch(() => null);
    if (info?.isDirectory()) {
      return flags;
    }
  }
  const src = path.join(directory, 'src');
  const info = await stat(src).catch(() => null);
  return path.join(info?.isDirectory() ? src : directory, 'flags');
}

/**
 * The first line of `generated.d.ts`. Only a file with this line is removed
 * from a place where the declarations are no longer written.
 */
const DECLARATIONS_HEADER = '// Generated by the Flags SDK';

/**
 * Removes `generated.d.ts` from the other possible folder `flags`, e.g. from
 * `src/flags` after `flags/sources` was created in the root. Otherwise two
 * files declare the modules `flags:<source>`. A file which the SDK did not
 * write stays.
 */
async function removeOtherDeclarations(
  directory: string,
  flagsDirectory: string,
): Promise<void> {
  for (const base of [directory, path.join(directory, 'src')]) {
    const flags = path.join(base, 'flags');
    if (path.resolve(flags) === path.resolve(flagsDirectory)) {
      continue;
    }
    const file = path.join(flags, GENERATED_DECLARATIONS);
    const content = await readFile(file, 'utf8').catch(() => undefined);
    if (content?.startsWith(DECLARATIONS_HEADER)) {
      await rm(file, { force: true });
    }
  }
}

/**
 * Whether the application depends on `@vercel/flags-core`, in any kind of
 * dependency of its `package.json`. This is the opt-in of the default
 * source `self`.
 */
async function dependsOnVercelFlags(directory: string): Promise<boolean> {
  const text = await readFile(
    path.join(directory, 'package.json'),
    'utf8',
  ).catch(() => undefined);
  if (text === undefined) {
    return false;
  }
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return false;
  }
  const kinds = [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ];
  return kinds.some((kind) => {
    const dependencies = manifest[kind];
    return (
      typeof dependencies === 'object' &&
      dependencies !== null &&
      VERCEL_FLAGS_PACKAGE in dependencies
    );
  });
}

/**
 * The sources: the directories of `flags/sources`, and the default source
 * `self` if it is on. Checks the files of each source before it imports a
 * catalog. A source needs `provider.ts` and `catalog.ts`, except the default
 * source, which takes each missing file from `@vercel/flags-core`.
 */
async function findSources(
  flagsDirectory: string,
  selfSource: boolean,
): Promise<SourcePlan[]> {
  const sourcesDirectory = path.join(flagsDirectory, 'sources');
  const entries = await readdir(sourcesDirectory, {
    withFileTypes: true,
  }).catch(() => []);
  const names = new Set(
    entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name),
  );
  if (selfSource) {
    names.add(SELF_SOURCE);
  }
  const plans: SourcePlan[] = [];
  for (const name of [...names].sort()) {
    assertSourceName(name);
    const hasFile = (file: string) =>
      isFile(path.join(sourcesDirectory, name, file));
    const isDefault = selfSource && name === SELF_SOURCE;
    const parts: Record<'catalog' | 'provider', 'file' | 'vercel'> = {
      catalog: 'file',
      provider: 'file',
    };
    for (const [part, file] of [
      ['catalog', CATALOG_FILE],
      ['provider', PROVIDER_FILE],
    ] as const) {
      if (await hasFile(file)) {
        continue;
      }
      if (!isDefault) {
        throw new Error(
          `flags: The source ${JSON.stringify(name)} needs flags/sources/${name}/${file}.`,
        );
      }
      parts[part] = 'vercel';
    }
    plans.push({ name, ...parts });
  }
  return plans;
}

/**
 * A native `import()`. The CommonJS build turns a plain `import()` into
 * `require()`, which can not load `catalog.ts` as a module of Node.js with
 * its types stripped, e.g. when Next.js loads `withFlags` as CommonJS.
 */
const nativeImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<unknown>;

type ResolveHook = (
  specifier: string,
  context: unknown,
  nextResolve: (specifier: string, context: unknown) => unknown,
) => unknown;

let resolveHookRegistered = false;

/**
 * Lets `catalog.ts` and the modules which it imports use relative imports
 * without an extension, as in the rest of a TypeScript application. Node.js
 * runs these files with its own type stripping, which needs `.ts` in each
 * relative import, and TypeScript only accepts `.ts` there with
 * `allowImportingTsExtensions`. The hook tries `.ts` and `/index.ts` when a
 * relative import is not found. It needs `module.registerHooks` of Node.js
 * 22.15 or newer; without it, nothing changes.
 */
function allowImportsWithoutExtension(): void {
  if (resolveHookRegistered) {
    return;
  }
  resolveHookRegistered = true;
  const { registerHooks } = nodeModule as {
    registerHooks?: (hooks: { resolve: ResolveHook }) => unknown;
  };
  if (!registerHooks) {
    return;
  }
  registerHooks({
    resolve(specifier, context, nextResolve) {
      try {
        return nextResolve(specifier, context);
      } catch (error) {
        const code = (error as { code?: unknown } | null)?.code;
        const relative =
          specifier.startsWith('./') || specifier.startsWith('../');
        if (
          !relative ||
          path.extname(specifier) !== '' ||
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
  });
}

async function importModule(specifier: string): Promise<unknown> {
  allowImportsWithoutExtension();
  try {
    return await nativeImport(specifier);
  } catch (error) {
    // In a VM context without an import callback, e.g. in a test runner
    if (
      (error as { code?: unknown } | null)?.code ===
      'ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING'
    ) {
      // A bundler of a build tool, e.g. Turbopack for its loaders, must not
      // try to resolve the catalog of the application
      return import(
        /* webpackIgnore: true */ /* turbopackIgnore: true */ /* @vite-ignore */ specifier
      );
    }
    throw error;
  }
}

/**
 * Loads the catalog loader of Vercel Flags from the dependencies of the
 * application, not of this package.
 */
async function importVercelCatalogLoader(
  directory: string,
): Promise<CatalogLoader> {
  const require = nodeModule.createRequire(
    path.join(directory, 'package.json'),
  );
  let file: string;
  try {
    file = require.resolve(VERCEL_CATALOG_MODULE);
  } catch (cause) {
    throw new Error(
      `flags: The default source "self" needs ${VERCEL_CATALOG_MODULE}. Install @vercel/flags-core, or set \`"selfSource": false\` in flags/config.json.`,
      { cause },
    );
  }
  const loaded = (await importModule(pathToFileURL(file).href)) as {
    loadCatalog?: unknown;
  };
  if (typeof loaded.loadCatalog !== 'function') {
    throw new Error(
      `flags: ${VERCEL_CATALOG_MODULE} has no loadCatalog. Update @vercel/flags-core.`,
    );
  }
  return loaded.loadCatalog as CatalogLoader;
}

/**
 * The catalog of the default source: like the catalog of Vercel Flags, but
 * if it fails before its first catalog, e.g. without the credentials of
 * `vercel env pull` in CI, the source has no flags and the SDK warns. An
 * import of a flag of `flags:self` then fails the type check.
 */
function tolerantCatalogLoader(loadCatalog: CatalogLoader): CatalogLoader {
  return async function* (options) {
    let loaded = false;
    try {
      for await (const catalog of snapshotsOf(loadCatalog, options.signal)) {
        loaded = true;
        yield catalog;
      }
    } catch (error) {
      if (loaded || options.signal.aborted) {
        throw error;
      }
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(
        `flags: The default source "self" has no flags, because the flags of Vercel Flags could not be loaded: ${reason} Run \`vercel link\` and \`vercel env pull\`, or set \`"selfSource": false\` in flags/config.json.`,
      );
      yield { project: { system: 'vercel-flags' }, flags: {} };
    }
  };
}

async function importCatalogLoader(
  flagsDirectory: string,
  name: string,
): Promise<CatalogLoader> {
  const file = path.join(flagsDirectory, 'sources', name, CATALOG_FILE);
  const loaded = (await importModule(pathToFileURL(file).href)) as {
    default?: unknown;
  };
  const loadCatalog = loaded.default;
  if (typeof loadCatalog !== 'function') {
    throw new Error(
      `flags: flags/sources/${name}/catalog.ts must have a default export which loads the catalog.`,
    );
  }
  return loadCatalog as CatalogLoader;
}

function checkCatalog(name: string, catalog: unknown): Catalog {
  const flags = (catalog as { flags?: unknown } | null)?.flags;
  if (typeof flags !== 'object' || flags === null) {
    throw new Error(
      `flags: The catalog of the source ${JSON.stringify(name)} has no flags.`,
    );
  }
  for (const [key, flag] of Object.entries(flags)) {
    if (!Array.isArray((flag as { variants?: unknown })?.variants)) {
      throw new Error(
        `flags: Flag ${JSON.stringify(key)} of the source ${JSON.stringify(name)} has no variants.`,
      );
    }
  }
  return catalog as Catalog;
}

async function writeModules(
  directory: string,
  flagsDirectory: string,
  catalogs: ReadonlyMap<string, Catalog>,
  providers: ReadonlyMap<string, 'file' | 'vercel'>,
): Promise<FlagsAliases> {
  const output = path.join(directory, GENERATED_DIRECTORY);
  // The imports of the files of each source, from the generated modules
  const sourcesPath = path
    .relative(output, path.join(flagsDirectory, 'sources'))
    .split(path.sep)
    .join('/');
  // Render all files before a file changes, so that an error changes
  // nothing
  const modules = await Promise.all(
    [...catalogs].map(async ([name, catalog]) => {
      // Checked for each write, so a catalog change after a new context.ts
      // picks it up
      const files: SourceFiles = {
        context: await isFile(
          path.join(flagsDirectory, 'sources', name, CONTEXT_FILE),
        ),
        provider: providers.get(name) ?? 'file',
        hooks: await isFile(
          path.join(flagsDirectory, 'sources', name, HOOKS_FILE),
        ),
      };
      return {
        name,
        catalog,
        files,
        code: renderSourceModule(name, catalog, sourcesPath, files),
      };
    }),
  );
  const declarations = renderDeclarations(
    modules.map(({ name, catalog, files }) => [name, catalog, files] as const),
  );
  await mkdir(output, { recursive: true });
  // Git ignores the folder without a change to the .gitignore of the app
  await writeIfChanged(output, '.gitignore', '*\n');
  const aliases: FlagsAliases = {};
  for (const { name, code } of modules) {
    await writeIfChanged(output, `${name}.ts`, code);
    aliases[`flags:${name}`] = `./${GENERATED_DIRECTORY}/${name}.ts`;
  }
  // The module of a removed source must also go, e.g. from the editor
  for (const file of await readdir(output)) {
    if (file.endsWith('.ts') && !catalogs.has(file.slice(0, -3))) {
      await rm(path.join(output, file));
    }
  }
  // The folder flags exists, unless it is for the default source only
  await mkdir(flagsDirectory, { recursive: true });
  await writeIfChanged(flagsDirectory, GENERATED_DECLARATIONS, declarations);
  await removeOtherDeclarations(directory, flagsDirectory);
  const summary = Object.fromEntries(
    modules.map(({ name, catalog }) => [
      name,
      {
        ...(catalog.revision !== undefined
          ? { revision: catalog.revision }
          : {}),
        flags: Object.keys(catalog.flags).length,
      },
    ]),
  );
  await writeIfChanged(
    output,
    'catalog.json',
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  await writeIfChanged(
    output,
    'aliases.json',
    `${JSON.stringify(aliases, null, 2)}\n`,
  );
  return aliases;
}

async function* snapshotsOf(
  loadCatalog: CatalogLoader,
  signal: AbortSignal,
): AsyncGenerator<Catalog> {
  const result = await loadCatalog({ signal });
  if (
    typeof result === 'object' &&
    result !== null &&
    Symbol.asyncIterator in result
  ) {
    yield* result;
  } else {
    yield result as Catalog;
  }
}

export interface WatchResult {
  /**
   * The aliases after the first generation.
   */
  readonly aliases: FlagsAliases;
  /**
   * Resolves when all catalogs end or the signal aborts. Rejects when a
   * catalog fails. The generated files of the last good catalogs stay.
   */
  readonly done: Promise<void>;
}

async function start(
  directory: string,
  watch: boolean,
  signal: AbortSignal | undefined,
): Promise<WatchResult> {
  const root = path.resolve(directory);
  const controller = new AbortController();
  const stop = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', stop, { once: true });
  if (signal?.aborted) {
    stop();
  }
  const streams: { name: string; iterator: AsyncGenerator<Catalog> }[] = [];
  const close = async () => {
    controller.abort();
    signal?.removeEventListener('abort', stop);
    await Promise.allSettled(
      streams.map(({ iterator }) => iterator.return(undefined)),
    );
  };

  try {
    controller.signal.throwIfAborted();
    // An application with flags files declares its flags in them, and uses
    // no catalog. Only the types of TypeScript before 7.1 are written.
    if (findFlagsFiles(root).length > 0) {
      const { problems } = await writeFlagsFileDeclarations(root);
      for (const problem of problems) {
        console.error(problem);
      }
      if (!watch) {
        await close();
        return { aliases: {}, done: Promise.resolve() };
      }
      watchFlagsFileDeclarations(root, controller.signal);
      const done = new Promise<void>((resolve) => {
        controller.signal.addEventListener('abort', () => resolve(), {
          once: true,
        });
      }).finally(close);
      return { aliases: {}, done };
    }
    // The opt-in is the dependency, the opt-out is flags/config.json
    const selfSource =
      readSettings(root).selfSource !== false &&
      (await dependsOnVercelFlags(root));
    const found = await findFlagsDirectory(root);
    // Without flags/sources and without the default source there is nothing
    // to generate, and no file is written
    if (found === undefined && !selfSource) {
      await close();
      return { aliases: {}, done: Promise.resolve() };
    }
    const flagsDirectory = found ?? (await defaultFlagsDirectory(root));
    const plans = await findSources(flagsDirectory, selfSource);
    const providers = new Map(plans.map((plan) => [plan.name, plan.provider]));
    for (const plan of plans) {
      const loadCatalog =
        plan.catalog === 'vercel'
          ? tolerantCatalogLoader(await importVercelCatalogLoader(root))
          : await importCatalogLoader(flagsDirectory, plan.name);
      streams.push({
        name: plan.name,
        iterator: snapshotsOf(loadCatalog, controller.signal),
      });
    }
    const initial = await Promise.all(
      streams.map(async ({ name, iterator }) => {
        const first = await iterator.next();
        if (first.done) {
          throw new Error(
            `flags: The catalog of the source ${JSON.stringify(name)} gave no catalog.`,
          );
        }
        return [name, checkCatalog(name, first.value)] as const;
      }),
    );
    controller.signal.throwIfAborted();
    let catalogs = new Map(initial);
    const aliases = await writeModules(
      root,
      flagsDirectory,
      catalogs,
      providers,
    );
    if (!watch) {
      await close();
      return { aliases, done: Promise.resolve() };
    }

    // One queue of writes keeps the order of the changes of all sources
    let writes = Promise.resolve();
    const consumers = streams.map(async ({ name, iterator }) => {
      for await (const catalog of iterator) {
        if (controller.signal.aborted) {
          break;
        }
        writes = writes.then(async () => {
          controller.signal.throwIfAborted();
          const next = new Map(catalogs).set(name, checkCatalog(name, catalog));
          await writeModules(root, flagsDirectory, next, providers);
          catalogs = next;
        });
        await writes;
      }
    });
    const done = Promise.all(consumers)
      .then(() => {})
      .catch((error: unknown) => {
        if (!signal?.aborted) {
          throw error;
        }
      })
      .finally(close);
    // The caller can start a server before it awaits done
    done.catch(() => {});
    return { aliases, done };
  } catch (error) {
    await close();
    throw error;
  }
}

/**
 * Generates the modules of all sources one time, from the first catalog of
 * each source, then closes the catalogs. Returns the aliases.
 *
 * @param directory - The directory of the application, which contains
 * `flags/sources`.
 */
export async function generateFlags(
  directory: string = process.cwd(),
): Promise<FlagsAliases> {
  const { aliases } = await start(directory, false, undefined);
  return aliases;
}

/**
 * Generates the modules of all sources, and again after each change of a
 * catalog, until the signal aborts. Resolves when the first modules exist.
 *
 * @param directory - The directory of the application, which contains
 * `flags/sources`.
 */
export function watchFlags(
  directory: string,
  options: { readonly signal: AbortSignal },
): Promise<WatchResult> {
  return start(directory, true, options.signal);
}
