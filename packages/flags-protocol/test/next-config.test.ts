import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_SERVER,
} from 'next/constants.js';
import { withFlags } from '../src/next-config.ts';

test('the config entry reads only the manifest and preserves user settings', async (t) => {
  const directory = await mkdtemp(
    path.join(import.meta.dirname, '../.flags-test-'),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, '.flags'));
  await writeFile(
    path.join(directory, '.flags/manifest.json'),
    JSON.stringify({ 'flags:site': './.flags/site.ts' }),
  );
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
  assert.equal(resource.request, path.join(directory, '.flags/site.ts'));
  assert.throws(
    () => replace!({ request: 'flags:missing' }),
    /Unknown flags source/,
  );
});

test('production startup does not require a manifest; development reports a missing sync', async (t) => {
  const directory = await mkdtemp(
    path.join(import.meta.dirname, '../.flags-test-'),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  const base = { poweredByHeader: false };
  const config = withFlags(base, { directory });
  assert.equal(await config(PHASE_PRODUCTION_SERVER), base);
  await assert.rejects(config(PHASE_DEVELOPMENT_SERVER), /Run pnpm flags:sync/);
});
