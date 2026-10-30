import assert from 'node:assert/strict';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { generateFlags } from '../src/generate.ts';

async function fixture(t: { after(cleanup: () => Promise<void>): void }) {
  const directory = await mkdtemp(
    path.join(import.meta.dirname, '../.flags-test-'),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function addSource(directory: string, name: string) {
  const source = path.join(directory, 'flags/sources', name);
  await mkdir(source, { recursive: true });
  await writeFile(
    path.join(source, 'catalog.ts'),
    `export default async function loadCatalog() {
      return {
        id: '${name}/development',
        flags: { enabled: { variants: [true, false], description: 'Demo flag.' } },
      };
    }`,
  );
  // These modules are valid paths, but executing either would fail the sync.
  for (const file of ['provider.ts', 'context.ts']) {
    await writeFile(
      path.join(source, file),
      `throw new Error('${file} must only load in the application');`,
    );
  }
  return source;
}

test('sync discovers sources and reads only their catalogs', async (t) => {
  const directory = await fixture(t);
  await addSource(directory, 'site');
  await addSource(directory, 'billing');
  const aliases = await generateFlags(directory);

  assert.deepEqual(aliases, {
    'flags:billing': './.flags/billing.ts',
    'flags:site': './.flags/site.ts',
  });
  assert.deepEqual(
    JSON.parse(
      await readFile(path.join(directory, '.flags/manifest.json'), 'utf8'),
    ),
    aliases,
  );
  const generatedModule = await readFile(
    path.join(directory, '.flags/site.ts'),
    'utf8',
  );
  assert.match(generatedModule, /sources\/site\/provider\.ts/);
  assert.match(generatedModule, /sources\/site\/context\.ts/);
  assert.doesNotMatch(generatedModule, /catalog\.ts|flags\.config/);
});

test('deleting a source removes its generated exports and manifest entry', async (t) => {
  const directory = await fixture(t);
  await addSource(directory, 'site');
  const billing = await addSource(directory, 'billing');
  await generateFlags(directory);
  await rm(billing, { recursive: true });
  await generateFlags(directory);

  await assert.rejects(stat(path.join(directory, '.flags/billing.ts')), {
    code: 'ENOENT',
  });
  assert.deepEqual(
    JSON.parse(
      await readFile(path.join(directory, '.flags/manifest.json'), 'utf8'),
    ),
    { 'flags:site': './.flags/site.ts' },
  );
  const summary = JSON.parse(
    await readFile(path.join(directory, '.flags/catalog.json'), 'utf8'),
  );
  assert.deepEqual(Object.keys(summary), ['site']);
});

test('a missing runtime module fails before a catalog executes', async (t) => {
  const directory = await fixture(t);
  const source = await addSource(directory, 'site');
  await rm(path.join(source, 'context.ts'));
  await writeFile(
    path.join(source, 'catalog.ts'),
    "throw new Error('Catalog must not load before source validation');",
  );
  await assert.rejects(generateFlags(directory), /site.*needs context\.ts/);
});

test('a failed catalog leaves the previous generated artifacts intact', async (t) => {
  const directory = await fixture(t);
  const source = await addSource(directory, 'site');
  await writeFile(
    path.join(source, 'catalog.ts'),
    "export default async function loadCatalog() { throw new Error('Catalog unavailable'); }",
  );
  const output = path.join(directory, '.flags');
  await mkdir(output);
  await writeFile(path.join(output, 'site.ts'), 'previous module');
  await writeFile(path.join(output, 'manifest.json'), 'previous manifest');

  await assert.rejects(generateFlags(directory), /Catalog unavailable/);
  assert.equal(
    await readFile(path.join(output, 'site.ts'), 'utf8'),
    'previous module',
  );
  assert.equal(
    await readFile(path.join(output, 'manifest.json'), 'utf8'),
    'previous manifest',
  );
});
