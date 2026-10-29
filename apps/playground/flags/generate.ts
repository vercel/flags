import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvConfig } from '@next/env';
import { renderModule } from './codegen.ts';

const appDirectory = path.resolve(import.meta.dirname, '..');
const outputDirectory = path.join(appDirectory, '.flags');

async function writeIfChanged(filename: string, content: string) {
  const target = path.join(outputDirectory, filename);
  const previous = await readFile(target, 'utf8').catch(() => null);
  if (previous !== content) {
    await writeFile(target, content);
  }
}

export async function generateFlags() {
  loadEnvConfig(appDirectory, process.env.NODE_ENV !== 'production');
  // Load environment variables before evaluating provider configuration.
  const { connections } = await import('../flags.config.ts');
  const catalogs = await Promise.all(
    Object.entries(connections).map(async ([name, connection]) => {
      const catalog = await connection.provider.loadCatalog();
      return { name, catalog, module: renderModule(name, catalog) };
    }),
  );

  await mkdir(outputDirectory, { recursive: true });
  const aliases: Record<string, string> = {};
  for (const { name, module } of catalogs) {
    await writeIfChanged(`${name}.ts`, module);
    aliases[`flags:${name}`] = `./.flags/${name}.ts`;
  }
  // Remove connections deleted from the config, so old imports cannot pass tsc.
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
  await writeIfChanged('catalog.json', `${JSON.stringify(summary, null, 2)}\n`);
  console.log(
    `[flags] ${catalogs.map(({ name, catalog }) => `${name}: ${Object.keys(catalog.flags).length} exports`).join(', ')}`,
  );
  return aliases;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  generateFlags().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : 'Flag generation failed.',
    );
    process.exitCode = 1;
  });
}
