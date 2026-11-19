import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
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
import { pathToFileURL } from 'node:url';
import { generateFlags, watchFlags } from '../src/generate.ts';

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

async function addStreamingSource(directory: string, name: string) {
  const source = await addSource(directory, name);
  const filename = path.join(source, 'catalog.ts');
  await writeFile(
    filename,
    `
    export let closed = false;
    export let delivered = 0;
    const pending = [];
    let wake;
    export function publish(catalog) {
      pending.push(catalog);
      wake?.();
    }
    export default async function* loadCatalog({ signal }) {
      const abort = () => wake?.();
      signal.addEventListener('abort', abort);
      try {
        yield {
          id: '${name}/development', revision: 1,
          flags: { enabled: { variants: [true, false] } },
        };
        while (!signal.aborted) {
          if (!pending.length) {
            await new Promise((resolve) => { wake = resolve; });
          }
          if (signal.aborted) { break; }
          const catalog = pending.shift();
          if (catalog instanceof Error) { throw catalog; }
          yield catalog;
          delivered += 1;
        }
      } finally {
        closed = true;
        signal.removeEventListener('abort', abort);
      }
    }
  `,
  );
  return import(pathToFileURL(filename).href);
}

async function waitFor(check: () => Promise<boolean> | boolean) {
  const deadline = Date.now() + 3000;
  while (!(await check())) {
    assert.ok(Date.now() < deadline, 'Timed out waiting for catalog output');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test('sync takes the initial streaming snapshot and closes the subscription', async (t) => {
  const directory = await fixture(t);
  const source = await addStreamingSource(directory, 'site');
  await generateFlags(directory);
  assert.equal(source.closed, true);
  assert.match(
    await readFile(path.join(directory, '.flags/site.ts'), 'utf8'),
    /"enabled"/,
  );
});

test('watch updates keys, variants, and JSDoc across sources without rewriting duplicates', async (t) => {
  const directory = await fixture(t);
  const site = await addStreamingSource(directory, 'site');
  const billing = await addStreamingSource(directory, 'billing');
  const controller = new AbortController();
  const { done } = await watchFlags(directory, { signal: controller.signal });
  t.after(async () => {
    controller.abort();
    await done;
  });

  const siteFile = path.join(directory, '.flags/site.ts');
  assert.match(await readFile(siteFile, 'utf8'), /"enabled"/);
  const updated = {
    id: 'site/development',
    revision: 2,
    flags: {
      offer: { variants: ['small', 'large'], description: 'Updated offer.' },
    },
  };
  site.publish(updated);
  billing.publish({
    id: 'billing/development',
    revision: 2,
    flags: { price: { variants: [10, 20] } },
  });
  await waitFor(() => site.delivered === 1 && billing.delivered === 1);
  const module = await readFile(siteFile, 'utf8');
  assert.doesNotMatch(module, /"enabled"/);
  assert.match(module, /\["small","large"\] as const/);
  assert.match(module, /Updated offer\./);
  assert.match(
    await readFile(path.join(directory, '.flags/billing.ts'), 'utf8'),
    /"price"/,
  );
  const summaryFile = path.join(directory, '.flags/catalog.json');
  assert.deepEqual(JSON.parse(await readFile(summaryFile, 'utf8')), {
    billing: { id: 'billing/development', revision: 2, flags: 1 },
    site: { id: 'site/development', revision: 2, flags: 1 },
  });

  const beforeModule = await stat(siteFile);
  const beforeSummary = await stat(summaryFile);
  site.publish(updated);
  await waitFor(() => site.delivered === 2);
  assert.equal((await stat(siteFile)).mtimeMs, beforeModule.mtimeMs);
  assert.equal((await stat(summaryFile)).mtimeMs, beforeSummary.mtimeMs);
  // Targeting-only changes update the summary without rewriting import types.
  site.publish({ ...updated, revision: 3 });
  await waitFor(() => site.delivered === 3);
  assert.equal((await stat(siteFile)).mtimeMs, beforeModule.mtimeMs);

  controller.abort();
  await done;
  assert.equal(site.closed, true);
  assert.equal(billing.closed, true);
});

test('watch failure preserves generated files and closes other subscriptions', async (t) => {
  const directory = await fixture(t);
  const site = await addStreamingSource(directory, 'site');
  const billing = await addStreamingSource(directory, 'billing');
  const controller = new AbortController();
  t.after(() => controller.abort());
  const { done } = await watchFlags(directory, { signal: controller.signal });
  const file = path.join(directory, '.flags/site.ts');
  const before = await readFile(file, 'utf8');
  site.publish(new Error('Catalog subscription failed'));
  await assert.rejects(done, /Catalog subscription failed/);
  assert.equal(await readFile(file, 'utf8'), before);
  assert.equal(site.closed, true);
  assert.equal(billing.closed, true);
});

test('a stream must supply an initial catalog', async (t) => {
  const directory = await fixture(t);
  const source = await addSource(directory, 'site');
  await writeFile(
    path.join(source, 'catalog.ts'),
    'export default async function* () {}',
  );
  await assert.rejects(generateFlags(directory), /site.*returned no catalog/);
});

test('watch CLI generates before starting its child and closes when the child exits', async (t) => {
  const directory = await fixture(t);
  const source = await addSource(directory, 'site');
  await writeFile(
    path.join(source, 'catalog.ts'),
    `
    import { writeFile } from 'node:fs/promises';
    export default async function* ({ signal }) {
      try {
        yield { id: 'site/dev', flags: { enabled: { variants: [true, false] } } };
        if (!signal.aborted) {
          await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
        }
      } finally {
        await writeFile('closed.txt', 'closed');
      }
    }
  `,
  );
  const cli = path.resolve(import.meta.dirname, '../bin/flags.mjs');
  const child = spawn(
    process.execPath,
    [
      cli,
      'watch',
      '--',
      process.execPath,
      '-e',
      `
    const { readFileSync } = require('node:fs');
    const manifest = JSON.parse(readFileSync('.flags/manifest.json', 'utf8'));
    if (!manifest['flags:site']) { process.exit(1); }
    console.log('child ready');
  `,
    ],
    { cwd: directory, stdio: 'pipe' },
  );
  t.after(() => {
    child.kill('SIGKILL');
  });
  let output = '';
  child.stdout.on('data', (data) => {
    output += data;
  });
  child.stderr.on('data', (data) => {
    output += data;
  });
  const [code] = await once(child, 'exit');
  assert.equal(code, 0, output);
  assert.match(output, /child ready/);
  assert.equal(
    await readFile(path.join(directory, 'closed.txt'), 'utf8'),
    'closed',
  );
});
