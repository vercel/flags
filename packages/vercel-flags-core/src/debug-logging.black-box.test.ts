import {
  afterEach,
  beforeEach,
  expect,
  it,
  type MockInstance,
  vi,
} from 'vitest';
import {
  type BundledDefinitions,
  createClient,
  type FlagsClient,
} from './index.default';
import { setRequestContext } from './test-utils';
import { readBundledDefinitions } from './utils/read-bundled-definitions';

vi.mock('./utils/read-bundled-definitions', () => ({
  readBundledDefinitions: vi.fn(),
}));

const SDK_KEY = 'vf_server_secret-never-log';
const SECRETS = [
  'secret-never-log',
  'Bearer',
  'Authorization',
  'variant-never-log',
  'entity-never-log',
  'raw error never log',
  'header-value-never-log',
];

const now = 1_700_000_000_000;
const clients = new Set<FlagsClient>();
const dataFetch = vi.fn<typeof fetch>();
const streamFetch = vi.fn<typeof fetch>();
let output: MockInstance<typeof console.debug>;
let cleanupContext = () => {};

function data(revision = 1): BundledDefinitions {
  return {
    projectId: 'prj_debug',
    environment: 'production',
    revision,
    digest: String(revision),
    configUpdatedAt: revision,
    fetchedAt: now,
    segments: {},
    definitions: {
      feature: {
        environments: { production: 1 },
        variants: ['variant-never-log', 'other-variant'],
      },
    },
  };
}

function stream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
    },
  });
  return {
    response: new Response(body),
    push(message: unknown) {
      controller.enqueue(
        new TextEncoder().encode(`${JSON.stringify(message)}\n`),
      );
    },
    fail(error: Error) {
      controller.error(error);
    },
  };
}

function client(options: Parameters<typeof createClient>[1] = {}) {
  const instance = createClient(SDK_KEY, {
    buildStep: false,
    vercel: false,
    disableMetrics: true,
    clientName: 'checkout',
    datafile: data(),
    fetch: (input, init) => {
      if (String(input).endsWith('/v1/datafile')) {
        return dataFetch(input, init);
      }
      if (String(input).endsWith('/v1/stream')) {
        return streamFetch(input, init);
      }
      return Promise.resolve(new Response());
    },
    ...options,
  });
  clients.add(instance);
  return instance;
}

function records() {
  return output.mock.calls.map(
    ([, record]) => record as Record<string, unknown>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv('DEBUG', '@vercel/flags-core');
  vi.mocked(readBundledDefinitions).mockResolvedValue({
    definitions: null,
    state: 'missing-file',
  });
  dataFetch.mockReset();
  streamFetch.mockReset();
  output = vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  try {
    for (const instance of clients) {
      await instance.shutdown();
    }
  } finally {
    clients.clear();
    cleanupContext();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  }
});

it('omits credentials, headers, definitions, entities, and raw errors from diagnostics', async () => {
  cleanupContext = setRequestContext({
    'x-vercel-flags-config-versions': `flags_prj_debug=2;flags_header-value-never-log=3`,
  });
  // Header mode: a newer version triggers a background refresh that fails.
  const headerClient = client({ vercel: true, staleWhileRevalidate: 60 });
  dataFetch.mockRejectedValue(new Error('raw error never log'));
  expect(
    (
      await headerClient.evaluate('feature', 'default', {
        id: 'entity-never-log',
      })
    ).value,
  ).toBe('other-variant');
  await vi.advanceTimersByTimeAsync(300);

  // Streaming: a datafile message, then a transport failure.
  const live = stream();
  streamFetch.mockResolvedValueOnce(live.response);
  const streamClient = client({ polling: false });
  const reading = streamClient.evaluate('feature');
  live.push({ type: 'datafile', data: data(2) });
  await reading;
  live.fail(new Error('raw error never log'));
  await vi.advanceTimersByTimeAsync(0);

  // Polling: a successful poll.
  dataFetch.mockResolvedValueOnce(Response.json(data(3)));
  const pollingClient = client({ stream: false });
  await pollingClient.evaluate('feature');

  const events = records();
  const names = new Set(events.map((record) => record.event));
  for (const expected of [
    'client.created',
    'client.state',
    'header.observed',
    'cache.freshness',
    'cache.refresh.background',
    'datafile.fetch.failed',
    'cache.fetch.failed',
    'client.read',
    'stream.data',
    'cache.update.accepted',
    'stream.reconnect',
    'poll.start',
    'cache.fetch.applied',
  ]) {
    expect(names).toContain(expected);
  }
  for (const record of events) {
    expect(record).toMatchObject({
      event: expect.any(String),
      clientName: 'checkout',
    });
    for (const value of Object.values(record)) {
      expect(['string', 'number', 'boolean', 'undefined']).toContain(
        typeof value,
      );
    }
  }
  const serialized = JSON.stringify(output.mock.calls);
  for (const secret of SECRETS) {
    expect(serialized).not.toContain(secret);
  }
});

it('keeps reads working when console.debug throws', async () => {
  output.mockImplementation(() => {
    throw new Error('closed output stream');
  });
  dataFetch.mockResolvedValue(Response.json(data(2)));
  const instance = client({ stream: false });
  await instance.initialize();
  expect(await instance.evaluate('feature')).toMatchObject({
    value: 'other-variant',
    metrics: { mode: 'polling', cacheStatus: 'HIT' },
  });
  expect((await instance.getDatafile()).revision).toBe(2);
  expect(output).toHaveBeenCalled();
});

it('reads DEBUG on each call', async () => {
  vi.stubEnv('DEBUG', 'other');
  const instance = client({ stream: false, polling: false });
  await instance.evaluate('feature');
  expect(output).not.toHaveBeenCalled();

  vi.stubEnv('DEBUG', '*');
  await instance.evaluate('feature');
  expect(output).toHaveBeenCalled();
  const emitted = output.mock.calls.length;

  vi.stubEnv('DEBUG', '*,-@vercel/flags-core');
  await instance.evaluate('feature');
  expect(output).toHaveBeenCalledTimes(emitted);
});
