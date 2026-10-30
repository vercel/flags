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
import { assertSourceName, renderModule } from './codegen.ts';
import type { Catalog, CatalogLoader } from './connection.ts';

async function writeIfChanged(
  outputDirectory: string,
  filename: string,
  content: string,
) {
  const target = path.join(outputDirectory, filename);
  const previous = await readFile(target, 'utf8').catch(() => null);
  if (previous === content) {
    return;
  }
  // A file watcher must never see a partially written TypeScript module.
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content);
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function discoverSources(directory: string) {
  const sourcesDirectory = path.join(directory, 'flags', 'sources');
  const entries = await readdir(sourcesDirectory, { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort();

  // Check runtime module paths without importing application code.
  for (const name of names) {
    assertSourceName(name);
    for (const file of ['catalog.ts', 'provider.ts', 'context.ts']) {
      const filename = path.join(sourcesDirectory, name, file);
      const info = await stat(filename).catch(() => null);
      if (!info?.isFile()) {
        throw new Error(`Flags source ${JSON.stringify(name)} needs ${file}.`);
      }
    }
  }

  return Promise.all(
    names.map(async (name) => {
      const filename = path.join(sourcesDirectory, name, 'catalog.ts');
      const { default: loadCatalog } = (await import(
        pathToFileURL(filename).href
      )) as { default: CatalogLoader };
      if (typeof loadCatalog !== 'function') {
        throw new Error(
          `Flags source ${JSON.stringify(name)} must default-export a catalog loader from catalog.ts.`,
        );
      }
      return { name, loadCatalog };
    }),
  );
}

async function writeCatalogs(
  directory: string,
  snapshots: Map<string, Catalog>,
) {
  // Validate every snapshot before changing any output.
  const catalogs = [...snapshots].map(([name, catalog]) => ({
    name,
    catalog,
    module: renderModule(name, catalog),
  }));
  const outputDirectory = path.join(directory, '.flags');
  await mkdir(outputDirectory, { recursive: true });
  const aliases: Record<string, string> = {};
  for (const { name, module } of catalogs) {
    await writeIfChanged(outputDirectory, `${name}.ts`, module);
    aliases[`flags:${name}`] = `./.flags/${name}.ts`;
  }
  // Deleted source directories must also disappear from editor completion.
  for (const file of await readdir(outputDirectory)) {
    if (file.endsWith('.ts') && !snapshots.has(file.slice(0, -3))) {
      await rm(path.join(outputDirectory, file));
    }
  }
  const summary = Object.fromEntries(
    catalogs.map(({ name, catalog }) => [
      name,
      {
        id: catalog.id,
        revision: catalog.revision,
        flags: Object.keys(catalog.flags).length,
      },
    ]),
  );
  await writeIfChanged(
    outputDirectory,
    'catalog.json',
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  await writeIfChanged(
    outputDirectory,
    'manifest.json',
    `${JSON.stringify(aliases, null, 2)}\n`,
  );
  console.log(
    `[flags] ${catalogs.map(({ name, catalog }) => `${name}: ${Object.keys(catalog.flags).length} exports`).join(', ')}`,
  );
  return aliases;
}

async function* snapshotsFrom(loader: CatalogLoader, signal: AbortSignal) {
  const result = await loader({ signal });
  if (Symbol.asyncIterator in result) {
    yield* result;
  } else {
    yield result;
  }
}

async function startGeneration(
  directory: string,
  watch: boolean,
  signal?: AbortSignal,
) {
  directory = path.resolve(directory);
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
    const sources = await discoverSources(directory);
    streams.push(
      ...sources.map(({ name, loadCatalog }) => ({
        name,
        iterator: snapshotsFrom(loadCatalog, controller.signal),
      })),
    );
    const initial = await Promise.all(
      streams.map(async ({ name, iterator }) => {
        const first = await iterator.next();
        if (first.done) {
          throw new Error(
            `Flags source ${JSON.stringify(name)} returned no catalog.`,
          );
        }
        return [name, first.value] as const;
      }),
    );
    controller.signal.throwIfAborted();
    let snapshots = new Map(initial);
    const aliases = await writeCatalogs(directory, snapshots);
    if (!watch) {
      await close();
      return { aliases, done: Promise.resolve() };
    }

    // A single write queue preserves update order across independent sources.
    let writes = Promise.resolve();
    const consumers = streams.map(async ({ name, iterator }) => {
      for await (const catalog of iterator) {
        if (controller.signal.aborted) {
          break;
        }
        writes = writes.then(async () => {
          controller.signal.throwIfAborted();
          const updated = new Map(snapshots).set(name, catalog);
          await writeCatalogs(directory, updated);
          snapshots = updated;
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
    // Callers can start their dev server before awaiting completion.
    void done.catch(() => {});
    return { aliases, done };
  } catch (error) {
    await close();
    throw error;
  }
}

/** Generate one snapshot, then close every catalog subscription. */
export async function generateFlags(directory = process.cwd()) {
  const { aliases } = await startGeneration(directory, false);
  return aliases;
}

/** Resolves after initial files exist. Await `done` to observe watch failures. */
export async function watchFlags(
  directory = process.cwd(),
  options: { signal: AbortSignal },
) {
  return startGeneration(directory, true, options.signal);
}
