import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
  PHASE_PRODUCTION_SERVER,
} from 'next/constants.js';
import { withFlags } from '../src/next-config.ts';

async function fixture(t: { after(cleanup: () => Promise<void>): void }) {
  const directory = await mkdtemp(
    path.join(import.meta.dirname, '../.flags-test-'),
  );
  const source = path.join(directory, 'flags/sources/site');
  await mkdir(source, { recursive: true });
  const filename = path.join(source, 'catalog.ts');
  await writeFile(
    filename,
    `
    import { appendFile } from 'node:fs/promises';
    export let loads = 0;
    export let closes = 0;
    export let delivered = 0;
    let fail = false;
    let wake;
    let updated;
    export function setFailure(value) { fail = value; }
    export function publish(catalog) { updated = catalog; wake?.(); }
    export default async function* ({ signal }) {
      loads += 1;
      await appendFile(${JSON.stringify(path.join(directory, 'loads.txt'))}, 'load\\n');
      if (fail) { throw new Error('Catalog unavailable'); }
      const abort = () => wake?.();
      signal.addEventListener('abort', abort);
      try {
        yield { id: 'site/dev', revision: 1, flags: { enabled: { variants: [true, false] } } };
        while (!signal.aborted) {
          if (!updated) { await new Promise((resolve) => { wake = resolve; }); }
          if (signal.aborted) { break; }
          const catalog = updated;
          updated = undefined;
          yield catalog;
          delivered += 1;
        }
      } finally {
        closes += 1;
        signal.removeEventListener('abort', abort);
      }
    }
  `,
  );
  for (const file of ['provider.ts', 'context.ts']) {
    await writeFile(
      path.join(source, file),
      `throw new Error('${file} must not load in config');`,
    );
  }
  const catalog = await import(pathToFileURL(filename).href);
  t.after(async () => {
    // Exercise shutdown without sending an OS signal to the test runner.
    process.emit('SIGTERM');
    await waitFor(() => process.listenerCount('SIGTERM') === 0);
    await rm(directory, { recursive: true, force: true });
  });
  return { directory, catalog };
}

async function waitFor(check: () => boolean) {
  const deadline = Date.now() + 3000;
  while (!check()) {
    assert.ok(Date.now() < deadline, 'Timed out waiting for catalog watch');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test('development generates before resolving config, watches, and preserves user settings', async (t) => {
  const { directory, catalog } = await fixture(t);
  const userPlugin = {};
  const config = await withFlags(
    {
      poweredByHeader: false,
      turbopack: { resolveAlias: { existing: './existing.ts' } },
      webpack(config) {
        config.plugins.push(userPlugin);
        return config;
      },
    },
    { directory },
  )(PHASE_DEVELOPMENT_SERVER);

  assert.equal(config.poweredByHeader, false);
  assert.deepEqual(config.turbopack?.resolveAlias, {
    existing: './existing.ts',
    'flags:site': './.flags/site.ts',
  });
  const file = path.join(directory, '.flags/site.ts');
  assert.match(await readFile(file, 'utf8'), /"enabled"/);
  catalog.publish({
    id: 'site/dev',
    revision: 2,
    flags: { offer: { variants: ['new'] } },
  });
  await waitFor(() => catalog.delivered === 1);
  assert.match(await readFile(file, 'utf8'), /"offer"/);
  assert.doesNotMatch(await readFile(file, 'utf8'), /"enabled"/);

  let replace: ((resource: { request: string }) => void) | undefined;
  class ReplacementPlugin {
    constructor(_pattern: RegExp, callback: typeof replace) {
      replace = callback;
    }
  }
  const webpackConfig = config.webpack!({ plugins: [] }, {
    webpack: { NormalModuleReplacementPlugin: ReplacementPlugin },
  } as never);
  assert.equal(webpackConfig.plugins[0], userPlugin);
  assert.ok(replace);
  const resource = { request: 'flags:site' };
  replace(resource);
  assert.equal(resource.request, file);
  assert.throws(
    () => replace!({ request: 'flags:missing' }),
    /Unknown flags source/,
  );
});

test('concurrent config evaluations and module reloads share one subscription', async (t) => {
  const { directory, catalog } = await fixture(t);
  const reloaded = await import(
    `${new URL('../src/next-config.ts', import.meta.url).href}?reload`
  );
  await Promise.all([
    withFlags({}, { directory })(PHASE_DEVELOPMENT_SERVER),
    withFlags({}, { directory })(PHASE_DEVELOPMENT_SERVER),
    reloaded.withFlags({}, { directory })(PHASE_DEVELOPMENT_SERVER),
  ]);
  assert.equal(catalog.loads, 1);
  assert.equal(catalog.closes, 0);
  process.emit('SIGTERM');
  await waitFor(() => catalog.closes === 1);
});

test('compiler child processes reuse the parent catalog subscription', async (t) => {
  const { directory, catalog } = await fixture(t);
  const { loadEnvConfig, resetEnv } = createRequire(import.meta.url)(
    '@next/env',
  );
  loadEnvConfig(directory, true);
  await withFlags({}, { directory })(PHASE_DEVELOPMENT_SERVER);
  resetEnv();
  const entry = new URL('../dist/next-config.js', import.meta.url).href;
  const child = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import { withFlags } from ${JSON.stringify(entry)};
    const config = await withFlags({}, { directory: ${JSON.stringify(directory)} })('phase-development-server');
    if (!config.turbopack.resolveAlias['flags:site']) { throw new Error('Missing alias'); }
  `,
    ],
    { stdio: 'pipe' },
  );
  t.after(async () => {
    child.kill('SIGKILL');
  });
  let output = '';
  child.stderr.on('data', (data) => {
    output += data;
  });
  const [code] = await once(child, 'exit');
  assert.equal(code, 0, output);
  assert.equal(
    await readFile(path.join(directory, 'loads.txt'), 'utf8'),
    'load\n',
  );
  assert.equal(catalog.closes, 0);
});

test('production build generates once and closes; production startup does no catalog work', async (t) => {
  const { directory, catalog } = await fixture(t);
  const base = { poweredByHeader: false };
  const config = withFlags(base, { directory });
  assert.equal(await config(PHASE_PRODUCTION_SERVER), base);
  assert.equal(catalog.loads, 0);
  await Promise.all([
    config(PHASE_PRODUCTION_BUILD),
    withFlags({}, { directory })(PHASE_PRODUCTION_BUILD),
  ]);
  assert.equal(catalog.loads, 1);
  assert.equal(catalog.closes, 1);
  await rm(path.join(directory, '.flags'), { recursive: true });
  assert.equal(await config(PHASE_PRODUCTION_SERVER), base);
  assert.equal(catalog.loads, 1);
});

test('isolated config contexts in the same process reuse the active subscription', async (t) => {
  const { directory, catalog } = await fixture(t);
  await withFlags({}, { directory })(PHASE_DEVELOPMENT_SERVER);
  const entry = new URL('../dist/next-config.js', import.meta.url).href;
  const script = `
    import { parentPort } from 'node:worker_threads';
    import { withFlags } from ${JSON.stringify(entry)};
    const config = await withFlags({}, { directory: ${JSON.stringify(directory)} })('phase-development-server');
    parentPort.postMessage(config.turbopack.resolveAlias['flags:site']);
  `;
  const worker = new Worker(
    new URL(`data:text/javascript,${encodeURIComponent(script)}`),
  );
  t.after(async () => {
    await worker.terminate();
  });
  const exited = once(worker, 'exit');
  const [alias] = await once(worker, 'message');
  assert.equal(alias, './.flags/site.ts');
  await exited;
  assert.equal(
    await readFile(path.join(directory, 'loads.txt'), 'utf8'),
    'load\n',
  );
  assert.equal(catalog.closes, 0);
});

test('initial catalog errors fail config loading and permit a later retry', async (t) => {
  const { directory, catalog } = await fixture(t);
  catalog.setFailure(true);
  const config = withFlags({}, { directory });
  await assert.rejects(config(PHASE_DEVELOPMENT_SERVER), /Catalog unavailable/);
  assert.equal(process.listenerCount('SIGTERM'), 0);
  catalog.setFailure(false);
  const resolved = await config(PHASE_DEVELOPMENT_SERVER);
  assert.equal(
    resolved.turbopack?.resolveAlias?.['flags:site'],
    './.flags/site.ts',
  );
  assert.equal(catalog.loads, 2);
});
