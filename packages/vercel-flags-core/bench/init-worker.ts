import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';
import { Authentication } from '../src/controller/auth';
import { BundledSource } from '../src/controller/bundled-source';
import { HeaderSource } from '../src/controller/header-source';
import { StreamSource } from '../src/controller/stream-source';
import { createClient } from '../src/index.default';
import { setRequestContext } from '../src/test-utils';
import { begin, finish, measure, measureSync, record } from './profile';

const scenario = JSON.parse(process.argv[2]!) as {
  name: string;
  auth: 'sdk-key' | 'oidc';
  source: 'offline' | 'header' | 'stream';
  embedded: boolean;
};
const fixture = JSON.parse(
  readFileSync(new URL('./manifest.json', import.meta.url), 'utf8'),
) as {
  sdkKey: string;
  token: string;
  projectId: string;
  configUpdatedAt: number;
  revision: number;
  flagCount: number;
};

// Never read real credentials or contact a real transport, including OIDC refresh.
process.env.VERCEL_OIDC_TOKEN = fixture.token;
process.env.VERCEL_ENV = 'production';
process.env.VERCEL_FLAGS_DEBUG_EMBEDDED_PARSE = '1';
let unexpectedFetches = 0;
globalThis.fetch = async () => {
  unexpectedFetches++;
  throw new Error('Unexpected network request in initialization benchmark');
};
const headers: Record<string, string> = {
  'x-vercel-oidc-token': fixture.token,
};
if (scenario.source === 'header') {
  headers['x-vercel-flags-config-versions'] =
    `flags_${fixture.projectId}=${fixture.configUpdatedAt}`;
}
const cleanupContext = setRequestContext(headers);

// Wrap actual source boundaries without changing the production client API.
const originalBundledLoad = BundledSource.prototype.tryLoad;
BundledSource.prototype.tryLoad = function () {
  return measure('bundledMs', () => originalBundledLoad.call(this));
};
const originalAuthLookup =
  Authentication.prototype.resolveBundledDefinitionsLookup;
Authentication.prototype.resolveBundledDefinitionsLookup = function () {
  return measure('authLookupMs', () => originalAuthLookup.call(this));
};
const originalHeaderCheck = HeaderSource.prototype.isAvailable;
HeaderSource.prototype.isAvailable = function (projectId) {
  return measureSync('headerCheckMs', () =>
    originalHeaderCheck.call(this, projectId),
  );
};
let startingStream = false;
const originalStreamStart = StreamSource.prototype.start;
StreamSource.prototype.start = function () {
  return measure('streamMs', async () => {
    startingStream = true;
    try {
      await originalStreamStart.call(this);
    } finally {
      startingStream = false;
    }
  });
};
const originalToken = Authentication.prototype.resolveToken;
Authentication.prototype.resolveToken = function () {
  return startingStream
    ? measure('streamAuthMs', () => originalToken.call(this))
    : originalToken.call(this);
};

// The generated parser records only JSON.parse, not console/logging time.
console.info = (label: string, metrics: { durationMs: number }) => {
  assert.equal(label, '@vercel/flags-definitions: JSON.parse');
  record('jsonParseMs', metrics.durationMs);
};

async function sample(cache: 'cold' | 'warm') {
  let streamCalls = 0;
  let streamCancelled = false;
  let response: Response | undefined;
  if (scenario.source === 'stream') {
    // Fixture construction is outside all measurements. Do not parse the real
    // definitions here: full datafiles are first parsed by the stream decoder.
    const wire = scenario.embedded
      ? `${JSON.stringify({
          type: 'primed',
          revision: fixture.revision,
          projectId: fixture.projectId,
          environment: 'production',
        })}\n`
      : readFileSync(new URL('./stream.ndjson', import.meta.url), 'utf8');
    const chunk = new TextEncoder().encode(wire);
    response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(chunk);
        },
        cancel() {
          streamCancelled = true;
        },
      }),
    );
  }
  const requests: { url: string; options?: RequestInit }[] = [];
  const transport: typeof fetch = async (input, options) => {
    streamCalls++;
    requests.push({ url: String(input), options });
    if (!response) throw new Error('Unexpected fetch in non-stream scenario');
    return response;
  };

  begin();
  const client = measureSync('createClientMs', () =>
    createClient(scenario.auth === 'sdk-key' ? fixture.sdkKey : undefined, {
      buildStep: false,
      stream: scenario.source !== 'offline',
      polling: false,
      disableMetrics: true,
      fetch: transport,
    }),
  );
  try {
    await measure('initializeMs', () => client.initialize());
    const { timings, calls } = finish();
    const start = performance.now();
    await client.initialize();
    const sameClientInitMs = performance.now() - start;
    const datafile = await client.getDatafile();
    assert.equal(
      datafile.metrics.mode,
      scenario.source === 'header'
        ? 'vercel'
        : scenario.source === 'stream'
          ? 'streaming'
          : 'offline',
    );
    assert.equal(Object.keys(datafile.definitions).length, fixture.flagCount);
    assert.equal(streamCalls, scenario.source === 'stream' ? 1 : 0);
    for (const request of requests) {
      assert.equal(request.url, 'https://flags.vercel.com/v1/stream');
      const requestHeaders = new Headers(request.options?.headers);
      assert.equal(
        requestHeaders.get('authorization'),
        `Bearer ${scenario.auth === 'sdk-key' ? fixture.sdkKey : fixture.token}`,
      );
      assert.equal(
        requestHeaders.get('x-revision'),
        scenario.embedded ? String(fixture.revision) : null,
      );
    }
    assert.equal(calls.bundledMs, 1);
    assert.equal(calls.bundleImportMs, 1);
    assert.equal(calls.authLookupMs, 1);
    assert.equal(calls.sdkKeyHashMs, scenario.auth === 'sdk-key' ? 1 : 0);
    assert.equal(
      calls.jsonParseMs,
      scenario.embedded && cache === 'cold' ? 1 : 0,
    );
    assert.equal(calls.headerCheckMs, scenario.embedded ? 1 : 0);
    assert.equal(calls.streamMs, scenario.source === 'stream' ? 1 : 0);
    assert.equal(calls.streamAuthMs, scenario.source === 'stream' ? 1 : 0);
    assert.equal(unexpectedFetches, 0);
    for (const duration of Object.values(timings)) {
      assert.ok(Number.isFinite(duration) && duration >= 0);
    }
    const attributed =
      timings.bundleImportMs +
      timings.authLookupMs +
      timings.sdkKeyHashMs +
      timings.jsonParseMs +
      timings.headerCheckMs +
      timings.streamMs;
    return {
      cache,
      timings: {
        ...timings,
        otherInitMs: Math.max(0, timings.initializeMs - attributed),
        sameClientInitMs,
      },
      streamCalls,
      calls,
    };
  } finally {
    finish();
    await client.shutdown();
    await setImmediate();
    assert.equal(streamCancelled, scenario.source === 'stream');
  }
}

async function main() {
  try {
    const cold = await sample('cold');
    // A new client in the same process reuses the imported definitions, parsed
    // datafile, SDK-key hash promise, and OIDC helper modules from the cold sample.
    const warm = await sample('warm');
    console.log(JSON.stringify({ cold, warm }));
  } finally {
    cleanupContext();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
