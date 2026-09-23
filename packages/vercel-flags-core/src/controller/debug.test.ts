import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from 'vitest';
import type { DatafileInput } from '../types';
import { getRequestContext } from '../utils/request-context';
import { Authentication } from './auth';
import { DatafileCache } from './datafile-cache';
import { createDebugLogger } from './debug';
import { Controller } from './index';
import { tagData } from './tagged-data';

vi.mock('../utils/request-context', () => ({ getRequestContext: vi.fn() }));

const data: DatafileInput = {
  projectId: 'prj_debug',
  environment: 'production',
  configUpdatedAt: 100,
  revision: 1,
  definitions: {},
  fetchedAt: 1_000,
};
let output: MockInstance<typeof console.debug>;

function events() {
  return output.mock.calls.map(([, record]) => record);
}

beforeEach(() => {
  vi.useFakeTimers({ now: 1_000 });
  vi.stubEnv('DEBUG', '@vercel/flags-core');
  output = vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.mocked(getRequestContext).mockReturnValue({
    ctx: undefined,
    headers: undefined,
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

function controller(
  options: Partial<ConstructorParameters<typeof Controller>[0]> = {},
) {
  return new Controller({
    auth: new Authentication('vf_server_secret-never-log'),
    datafile: data,
    buildStep: false,
    vercel: false,
    stream: false,
    polling: false,
    disableMetrics: true,
    ...options,
  });
}

describe('client debug logging', () => {
  it.each([
    undefined,
    '',
    '0',
    'other-package',
  ])('is silent for DEBUG=%s and does not compute details', async (value) => {
    vi.stubEnv('DEBUG', value);
    const details = vi.fn(() => ({ value: 1 }));
    createDebugLogger()('test', details);
    const client = controller();
    await client.initialize();
    await client.getDatafile();
    await client.shutdown();
    expect(details).not.toHaveBeenCalled();
    expect(output).not.toHaveBeenCalled();
  });

  it('supports the existing DEBUG namespace and distinguishes clients', async () => {
    vi.stubEnv('DEBUG', 'other,@vercel/flags-core');
    const first = controller();
    const second = controller({ buildStep: true });
    await first.initialize();
    await second.initialize();
    await first.getDatafile();
    await first.shutdown();
    await second.shutdown();
    const created = events().filter(
      (record) => record.event === 'client.created',
    );
    expect(created).toHaveLength(2);
    expect(created[0].clientId).not.toBe(created[1].clientId);
    expect(events()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'client.state',
          from: 'idle',
          to: 'degraded',
          clientId: created[0].clientId,
        }),
        expect.objectContaining({
          event: 'client.state',
          to: 'build:ready',
          clientId: created[1].clientId,
        }),
        expect.objectContaining({
          event: 'client.snapshot',
          cacheStatus: 'STALE',
        }),
        expect.objectContaining({ event: 'client.state', to: 'shutdown' }),
      ]),
    );
    expect(
      output.mock.calls.every(([prefix]) => prefix === '@vercel/flags-core'),
    ).toBe(true);
  });

  it('keeps reads working when console.debug throws', async () => {
    output.mockImplementation(() => {
      throw new Error('closed output');
    });
    const client = controller();
    await client.initialize();
    expect((await client.getDatafile()).revision).toBe(1);
    await client.shutdown();
  });

  it('explains header-driven blocking refreshes without logging credentials, headers, or definitions', async () => {
    vi.mocked(getRequestContext).mockReturnValue({
      ctx: undefined,
      headers: {
        'x-vercel-flags-config-versions':
          'flags_prj_debug=200;private-header=secret-header',
      },
    });
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ...data,
          configUpdatedAt: 200,
          revision: 2,
          definitions: { 'secret-flag': { secret: 'secret-definition' } },
        }),
      ),
    );
    const client = controller({
      vercel: true,
      stream: true,
      staleWhileRevalidate: 0,
      fetch,
    });
    await client.initialize();
    const result = await client.read();
    await client.shutdown();
    expect(result.revision).toBe(2);
    expect(events()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'header.observed',
          headerTimestamp: 200,
          configUpdatedAt: 100,
        }),
        expect.objectContaining({
          event: 'cache.freshness',
          status: 'expired',
        }),
        expect.objectContaining({ event: 'cache.refresh.blocking' }),
        expect.objectContaining({
          event: 'datafile.fetch.response',
          status: 200,
        }),
        expect.objectContaining({
          event: 'cache.update.accepted',
          revision: 2,
        }),
        expect.objectContaining({
          event: 'client.read',
          mode: 'vercel',
          cacheStatus: 'MISS',
        }),
      ]),
    );
    const serialized = JSON.stringify(output.mock.calls);
    for (const secret of [
      'vf_server_secret-never-log',
      'secret-header',
      'secret-flag',
      'secret-definition',
      'Authorization',
    ]) {
      expect(serialized).not.toContain(secret);
    }
    expect(new Set(events().map((record) => record.clientId)).size).toBe(1);
  });

  it('explains the permanent fallback when a Vercel read has no version header', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(async () => new Response(JSON.stringify(data)));
    const client = controller({
      vercel: true,
      polling: { intervalMs: 30_000, initTimeoutMs: 0 },
      fetch,
    });
    await client.initialize();
    await client.read();
    await client.shutdown();
    expect(events()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'header.fallback',
          reason: 'missing-version-header',
        }),
        expect.objectContaining({ event: 'cache.fetch.cancel' }),
        expect.objectContaining({
          event: 'client.state',
          from: 'vercel',
          to: 'initializing:polling',
        }),
        expect.objectContaining({ event: 'client.read', mode: 'polling' }),
      ]),
    );
  });

  it('logs polling and HTTP failures without serializing raw errors', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValue(new Error('sensitive-transport-error'));
    const client = controller({
      polling: { intervalMs: 30_000, initTimeoutMs: 0 },
      fetch,
    });
    await client.initialize();
    await client.getDatafile();
    await client.shutdown();
    expect(events()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: 'poll.start' }),
        expect.objectContaining({ event: 'datafile.fetch.failed' }),
        expect.objectContaining({ event: 'poll.failed' }),
        expect.objectContaining({ event: 'cache.failure', failed: true }),
        expect.objectContaining({ event: 'poll.stop' }),
      ]),
    );
    expect(JSON.stringify(output.mock.calls)).not.toContain(
      'sensitive-transport-error',
    );
  });

  it('logs stream connection, confirmation, ping, disconnect, and reconnect delay', async () => {
    let writer!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(value) {
        writer = value;
      },
    });
    const fetch = vi.fn().mockResolvedValue(new Response(body));
    const client = controller({ stream: true, fetch });
    const initialized = client.initialize();
    writer.enqueue(
      new TextEncoder().encode(
        `${JSON.stringify({ type: 'primed', projectId: data.projectId, environment: data.environment, revision: 1 })}\n`,
      ),
    );
    await initialized;
    writer.enqueue(new TextEncoder().encode('{"type":"ping"}\n'));
    await vi.advanceTimersByTimeAsync(0);
    writer.close();
    await vi.advanceTimersByTimeAsync(0);
    await client.shutdown();
    // Finish the aborted reconnect's sleep so no background work outlives this test.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(events()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: 'stream.connect', retryCount: 0 }),
        expect.objectContaining({
          event: 'stream.response',
          status: 200,
          revision: 1,
        }),
        expect.objectContaining({ event: 'stream.primed' }),
        expect.objectContaining({ event: 'stream.ping' }),
        expect.objectContaining({ event: 'stream.disconnected' }),
        expect.objectContaining({
          event: 'stream.reconnect',
          retryCount: 1,
          delayMs: 1_000,
        }),
        expect.objectContaining({
          event: 'client.state',
          from: 'streaming',
          to: 'degraded',
        }),
      ]),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('distinguishes background and shared refreshes, and logs cancellation', async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const background: Promise<unknown>[] = [];
    const cache = new DatafileCache(
      Infinity,
      (promise) => {
        background.push(promise);
      },
      createDebugLogger(),
    );
    cache.seed(tagData(data, 'provided'));
    const fetch = vi.fn(() => pending);
    const policy = { getStatus: () => 'stale' as const, fetch };
    await cache.resolve(policy);
    await cache.resolve(policy);
    cache.clear();
    finish();
    await Promise.all(background);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(events()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: 'cache.refresh.background' }),
        expect.objectContaining({ event: 'cache.fetch.shared' }),
        expect.objectContaining({ event: 'cache.fetch.aborted' }),
      ]),
    );
  });

  it('explains stale-if-error expiry and recovery without replacing an equal version', async () => {
    const cache = new DatafileCache(100, undefined, createDebugLogger());
    cache.seed(tagData(data, 'provided'));
    const outage = new Error('private error body');
    const policy = {
      getStatus: () => 'expired' as const,
      fetch: async () => {
        throw outage;
      },
    };
    expect((await cache.resolve(policy))?.[1]).toBe('STALE');
    await vi.advanceTimersByTimeAsync(101);
    expect(() => cache.read()).toThrow(outage);
    cache.updateFromSource({ ...data, configUpdatedAt: 99 }, 'poll');
    cache.updateFromSource(data, 'poll');
    expect(cache.read()?.revision).toBe(1);
    expect(events()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'cache.stale-if-error',
          failed: true,
        }),
        expect.objectContaining({
          event: 'cache.read.expired',
          canServe: false,
          failureAgeMs: 101,
        }),
        expect.objectContaining({
          event: 'cache.update.ignored',
          incomingConfigUpdatedAt: 99,
        }),
        expect.objectContaining({
          event: 'cache.confirmed',
          failed: false,
          ageMs: 0,
        }),
      ]),
    );
    expect(JSON.stringify(output.mock.calls)).not.toContain(
      'private error body',
    );
  });
});
