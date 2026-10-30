import {
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertSourceName, renderModule } from './codegen.ts';
import type { CatalogLoader } from './connection.ts';

async function writeIfChanged(
  outputDirectory: string,
  filename: string,
  content: string,
) {
  const target = path.join(outputDirectory, filename);
  const previous = await readFile(target, 'utf8').catch(() => null);
  if (previous !== content) {
    await writeFile(target, content);
  }
}

export async function generateFlags(directory = process.cwd()) {
  directory = path.resolve(directory);
  const sourcesDirectory = path.join(directory, 'flags', 'sources');
  const outputDirectory = path.join(directory, '.flags');
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

  const catalogs = await Promise.all(
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
      const catalog = await loadCatalog();
      return { name, catalog, module: renderModule(name, catalog) };
    }),
  );

  await mkdir(outputDirectory, { recursive: true });
  const aliases: Record<string, string> = {};
  for (const { name, module } of catalogs) {
    await writeIfChanged(outputDirectory, `${name}.ts`, module);
    aliases[`flags:${name}`] = `./.flags/${name}.ts`;
  }
  // Deleted source directories must also disappear from editor completion.
  for (const file of await readdir(outputDirectory)) {
    if (
      file.endsWith('.ts') &&
      !catalogs.some(({ name }) => file === `${name}.ts`)
    ) {
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
