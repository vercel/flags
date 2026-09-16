import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { cpus } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { build } from 'tsup';

const { values } = parseArgs({
  options: {
    definitions: { type: 'string' },
    samples: { type: 'string', default: '10' },
    json: { type: 'boolean', default: false },
  },
});
const sampleCount = Number(values.samples);
assert.ok(
  Number.isInteger(sampleCount) && sampleCount > 0 && sampleCount <= 100,
  '--samples must be an integer between 1 and 100',
);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const projectId = 'prj_init_benchmark';
const sdkKey = 'vf_server_init_benchmark';
const configUpdatedAt = 1_700_000_000_000;
const input = values.definitions
  ? JSON.parse(await readFile(values.definitions, 'utf8'))
  : {
      definitions: Object.fromEntries(
        Array.from({ length: 31 }, (_, index) => [
          `benchmark-${index}`,
          { environments: { production: 1 }, variants: [false, true] },
        ]),
      ),
    };
assert.ok(
  input &&
    typeof input === 'object' &&
    input.definitions &&
    typeof input.definitions === 'object' &&
    !Array.isArray(input.definitions),
  'Expected a datafile with a definitions object',
);
// Preserve flag/segment payloads, but never use project IDs or credentials from
// the supplied file. Stable metadata makes header and priming assertions exact.
const datafile = {
  ...input,
  projectId,
  environment: 'production',
  configUpdatedAt,
  revision: 1,
  digest: 'benchmark',
};
const scenarios = ['sdk-key', 'oidc'].flatMap((auth) => [
  { name: `${auth}/embedded-only`, auth, source: 'offline', embedded: true },
  { name: `${auth}/version-header`, auth, source: 'header', embedded: true },
  { name: `${auth}/stream-primed`, auth, source: 'stream', embedded: true },
  { name: `${auth}/stream-datafile`, auth, source: 'stream', embedded: false },
]);

const cacheDir = join(root, 'node_modules', '.cache');
await mkdir(cacheDir, { recursive: true });
const temp = await mkdtemp(join(cacheDir, 'flags-init-bench-'));
try {
  const profilePath = join(root, 'bench', 'profile.ts');
  await build({
    entry: {
      worker: join(root, 'bench', 'init-worker.ts'),
      prepare: join(root, '..', 'prepare-flags-definitions', 'src', 'index.ts'),
    },
    outDir: temp,
    outExtension: () => ({ js: '.mjs' }),
    format: ['esm'],
    target: 'node22',
    platform: 'node',
    config: false,
    bundle: true,
    splitting: false,
    dts: false,
    silent: true,
    skipNodeModulesBundle: true,
    external: ['@vercel/flags-definitions'],
    // Probe the two private async boundaries in a TEMPORARY build only. Keep
    // source checks strict so a refactor fails rather than silently losing a phase.
    esbuildPlugins: [
      {
        name: 'init-timing-probes',
        setup(esbuild) {
          esbuild.onLoad(
            { filter: /[/\\]read-bundled-definitions\.ts$/ },
            async ({ path }) => {
              let source = await readFile(path, 'utf8');
              const imports = [
                ...source.matchAll(/const module = await import\([\s\S]*?\);/g),
              ];
              assert.equal(
                imports.length,
                1,
                'Embedded import probe needs updating',
              );
              const original = imports[0][0];
              source = source.replace(
                original,
                original
                  .replace(
                    'await import(',
                    "await measureInitPhase('bundleImportMs', () => import(",
                  )
                  .replace(/\);$/, '));'),
              );
              const hash = 'const hashedKey = await hashSdkKey(lookup.sdkKey);';
              assert.equal(
                source.split(hash).length,
                2,
                'SDK key hash probe needs updating',
              );
              source = source.replace(
                hash,
                "const hashedKey = await measureInitPhase('sdkKeyHashMs', () => hashSdkKey(lookup.sdkKey));",
              );
              return {
                loader: 'ts',
                contents: `import { measure as measureInitPhase } from ${JSON.stringify(profilePath)};\n${source}`,
              };
            },
          );
        },
      },
    ],
  });
  const { generateDefinitionsModule, hashSdkKey } = await import(
    pathToFileURL(join(temp, 'prepare.mjs')).href
  );
  const token = `e30.${Buffer.from(
    JSON.stringify({
      project_id: projectId,
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString('base64url')}.synthetic`;
  await writeFile(
    join(temp, 'manifest.json'),
    JSON.stringify({
      sdkKey,
      token,
      projectId,
      configUpdatedAt,
      revision: 1,
      flagCount: Object.keys(datafile.definitions).length,
    }),
  );
  await writeFile(
    join(temp, 'stream.ndjson'),
    `${JSON.stringify({ type: 'datafile', data: datafile })}\n`,
  );
  const moduleDir = join(temp, 'node_modules', '@vercel', 'flags-definitions');
  await mkdir(moduleDir, { recursive: true });
  await writeFile(
    join(moduleDir, 'package.json'),
    JSON.stringify({
      name: '@vercel/flags-definitions',
      type: 'module',
      exports: './index.js',
    }),
  );
  const entries = [
    { key: hashSdkKey(sdkKey), definitions: datafile },
    { key: projectId, definitions: datafile },
  ];
  const rows = [];
  for (const scenario of scenarios) {
    await writeFile(
      join(moduleDir, 'index.js'),
      generateDefinitionsModule(scenario.embedded ? entries : [], undefined),
    );
    const runs = [];
    for (let i = 0; i < sampleCount; i++) {
      const child = spawnSync(
        process.execPath,
        [join(temp, 'worker.mjs'), JSON.stringify(scenario)],
        {
          encoding: 'utf8',
          env: { ...process.env, VERCEL_FLAGS_DEBUG_EMBEDDED_PARSE: '1' },
        },
      );
      if (child.error || child.status !== 0) {
        throw new Error(
          `Initialization benchmark failed (${scenario.name}): ${child.error?.message ?? child.stderr}`,
        );
      }
      runs.push(JSON.parse(child.stdout));
    }
    for (const cache of ['cold', 'warm']) {
      const samples = runs.map((run) => run[cache]);
      const metrics = Object.fromEntries(
        Object.keys(samples[0].timings).map((phase) => {
          const sorted = samples
            .map((sample) => sample.timings[phase])
            .sort((a, b) => a - b);
          const middle = Math.floor(sorted.length / 2);
          return [
            phase,
            {
              median:
                sorted.length % 2
                  ? sorted[middle]
                  : (sorted[middle - 1] + sorted[middle]) / 2,
              p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
            },
          ];
        }),
      );
      rows.push({
        scenario: scenario.name,
        cache,
        samples: sampleCount,
        metrics,
        calls: samples[0].calls,
      });
    }
  }
  const report = {
    node: process.version,
    platform: process.platform,
    cpu: cpus()[0]?.model,
    datafileBytes: Buffer.byteLength(JSON.stringify(datafile)),
    flagCount: Object.keys(datafile.definitions).length,
    freshProcesses: scenarios.length * sampleCount,
    rows,
  };
  if (values.json) {
    console.log(JSON.stringify(report));
  } else {
    console.log(
      `${report.node}, ${report.cpu}: ${report.flagCount} flags / ${report.datafileBytes} bytes; ${report.freshProcesses} fresh processes`,
    );
    console.log(
      'Milliseconds; phase columns are medians. Cold = fresh process, warm = new client in the same process.',
    );
    console.table(
      rows.map(({ scenario, cache, metrics }) => {
        const median = (key) => metrics[key].median.toFixed(3);
        return {
          scenario,
          cache,
          create: median('createClientMs'),
          init: median('initializeMs'),
          'init p95': metrics.initializeMs.p95.toFixed(3),
          import: median('bundleImportMs'),
          auth: median('authLookupMs'),
          hash: median('sdkKeyHashMs'),
          JSON: median('jsonParseMs'),
          header: median('headerCheckMs'),
          stream: median('streamMs'),
          other: median('otherInitMs'),
          reinit: median('sameClientInitMs'),
        };
      }),
    );
    console.log(
      'PASS: path, auth, header bypass, memoization, and stream cancellation assertions in every sample. No live network.',
    );
  }
} finally {
  // This directory is owned by this invocation; supplied files are never modified.
  await rm(temp, { recursive: true, force: true });
}
