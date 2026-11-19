/**
 * The code generation of `flags:<source>`. It reads the catalogs of
 * `flags/sources/<source>/catalog.ts`, and writes one module for each
 * source into `.flags/<source>.ts`. A framework plugin points the alias
 * `flags:<source>` to the module, and TypeScript finds it with
 * `"paths": { "flags:*": ["./.flags/*"] }`.
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
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Catalog, CatalogLoader } from './catalog';
import { assertSourceName, renderSourceModule } from './codegen';
import { GENERATED_DIRECTORY } from './generated-directory';

export { GENERATED_DIRECTORY };

/**
 * The aliases of the generated modules, e.g.
 * `{ 'flags:site': './.flags/site.ts' }`. Relative to the directory of the
 * application.
 */
export type FlagsAliases = Record<string, string>;

const SOURCE_FILES = ['catalog.ts', 'provider.ts', 'context.ts'] as const;

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
 * The names of the sources: the directories of `flags/sources`. Checks the
 * files of each source before it imports a catalog.
 */
async function findSources(directory: string): Promise<string[]> {
  const sourcesDirectory = path.join(directory, 'flags', 'sources');
  const entries = await readdir(sourcesDirectory, {
    withFileTypes: true,
  }).catch(() => []);
  const names = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort();
  for (const name of names) {
    assertSourceName(name);
    for (const file of SOURCE_FILES) {
      const info = await stat(path.join(sourcesDirectory, name, file)).catch(
        () => null,
      );
      if (!info?.isFile()) {
        throw new Error(
          `flags: The source ${JSON.stringify(name)} needs flags/sources/${name}/${file}.`,
        );
      }
    }
  }
  return names;
}

async function importCatalogLoader(
  directory: string,
  name: string,
): Promise<CatalogLoader> {
  const file = path.join(directory, 'flags', 'sources', name, 'catalog.ts');
  const { default: loadCatalog } = (await import(pathToFileURL(file).href)) as {
    default?: unknown;
  };
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
  catalogs: ReadonlyMap<string, Catalog>,
): Promise<FlagsAliases> {
  // Render all modules before a file changes, so that an error changes
  // nothing
  const modules = [...catalogs].map(([name, catalog]) => ({
    name,
    catalog,
    code: renderSourceModule(name, catalog),
  }));
  const output = path.join(directory, GENERATED_DIRECTORY);
  await mkdir(output, { recursive: true });
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
    for (const name of await findSources(root)) {
      const loadCatalog = await importCatalogLoader(root, name);
      streams.push({
        name,
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
    const aliases = await writeModules(root, catalogs);
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
          await writeModules(root, next);
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
