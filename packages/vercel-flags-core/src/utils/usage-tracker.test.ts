import { waitUntil } from '@vercel/functions';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Auth } from '../controller/auth';
import { setRequestContext } from '../test-utils';
import { ResolutionReason } from '../types';
import {
  EVALUATING_OIDC_TOKEN_HEADER,
  FLUSH_REASON_HEADER,
  type IngestOptions,
} from './ingest';
import { UsageTracker } from './usage-tracker';

type SerializedConfigReadEvent = {
  type: 'FLAGS_CONFIG_READ';
  ts: number;
  payload: {
    deploymentId?: string;
    region?: string;
    invocationHost?: string;
    vercelRequestId?: string;
    cacheStatus?: string;
    cacheAction?: string;
    cacheIsBlocking?: boolean;
    cacheIsFirstRead?: boolean;
    duration?: number;
    configUpdatedAt?: number;
    configOrigin?: string;
    mode?: string;
    revision?: string;
    environment?: string;
  };
};

type SerializedEvaluationEvent = {
  type: 'FLAG_EVALUATION';
  ts: number;
  payload: {
    flagKey: string;
    variant: string;
    reason: ResolutionReason;
    clientName?: string;
    evaluationCount: number;
    periodStartedAt: number;
  };
};

const getVercelOidcTokenMock = vi.hoisted(() => vi.fn());

vi.mock('@vercel/oidc', () => ({
  getVercelOidcToken: getVercelOidcTokenMock,
}));

// Mock @vercel/functions
vi.mock('@vercel/functions', () => ({
  waitUntil: vi.fn(),
}));

const waitUntilMock = vi.mocked(waitUntil);

const fetchMock = vi.fn<typeof fetch>();

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function jsonResponse(
  body: unknown,
  init?: { status?: number; headers?: Record<string, string> },
): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: init?.status ?? 200,
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    }),
  );
}

let cleanupContext: (() => void) | undefined;

beforeEach(() => {
  // Set up request context so trackRead doesn't skip (it's skipped when ctx is unavailable)
  cleanupContext = setRequestContext({ host: 'example.com' });
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  waitUntilMock.mockReset();
});

afterEach(() => {
  cleanupContext?.();
  cleanupContext = undefined;
  fetchMock.mockReset();
  getVercelOidcTokenMock.mockReset();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

function createAuth(sdkKey = 'test-key'): Auth {
  return {
    sdkKey,
    resolveToken: () => Promise.resolve(sdkKey),
    resolveBundledDefinitionsLookup: () =>
      Promise.resolve({ type: 'sdk-key', sdkKey }),
  };
}

function createTracker(sdkKey = 'test-key', options?: Partial<IngestOptions>) {
  return new UsageTracker({
    auth: createAuth(sdkKey),
    host: 'https://example.com',
    fetch: fetchMock,
    ...options,
  });
}

function getBody(callIndex = 0): unknown {
  const [, init] = fetchMock.mock.calls[callIndex]!;
  return JSON.parse(init!.body as string);
}

function getHeaders(callIndex = 0): Record<string, string> {
  const [, init] = fetchMock.mock.calls[callIndex]!;
  return init!.headers as Record<string, string>;
}

describe('UsageTracker', () => {
  describe('constructor', () => {
    it('should create an instance with sdkKey and host', () => {
      const tracker = createTracker();
      expect(tracker).toBeInstanceOf(UsageTracker);
    });
  });

  describe('trackRead', () => {
    it('should skip when request context is unavailable', async () => {
      // Remove the request context set up in beforeEach
      cleanupContext?.();
      cleanupContext = undefined;

      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();
      tracker.trackRead();
      await tracker.shutdown();

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should batch events and send them after flush', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      tracker.trackRead();
      await tracker.shutdown();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const events = getBody() as SerializedConfigReadEvent[];
      expect(events).toHaveLength(1);
      const event = events[0] as SerializedConfigReadEvent;
      expect(event.type).toBe('FLAGS_CONFIG_READ');
      expect(event.ts).toBeTypeOf('number');
    });

    it('should timestamp config read events when they are tracked', async () => {
      vi.useFakeTimers();
      const trackedAt = new Date('2026-01-01T00:00:00.000Z');
      vi.setSystemTime(trackedAt);
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      tracker.trackRead();
      vi.setSystemTime(new Date(trackedAt.getTime() + 10_000));
      await tracker.shutdown();

      const events = getBody() as SerializedConfigReadEvent[];
      expect(events[0]?.ts).toBe(trackedAt.getTime());
    });

    it('should include deployment ID and region from environment', async () => {
      vi.stubEnv('VERCEL_DEPLOYMENT_ID', 'dpl_123');
      vi.stubEnv('VERCEL_REGION', 'iad1');

      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      tracker.trackRead();
      await tracker.shutdown();

      const events = getBody() as SerializedConfigReadEvent[];
      const event = events[0] as SerializedConfigReadEvent;
      expect(event.payload.deploymentId).toBe('dpl_123');
      expect(event.payload.region).toBe('iad1');
    });

    it('should batch multiple events', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      // Track multiple reads with different request contexts so they won't be deduplicated
      for (let i = 0; i < 3; i++) {
        cleanupContext?.();
        cleanupContext = setRequestContext({
          host: 'example.com',
          'x-vercel-id': `req-${i}`,
        });
        tracker.trackRead();
      }
      await tracker.shutdown();

      const events = getBody() as Array<{ type: string }>;
      expect(events).toHaveLength(3);
    });

    it('should send correct authorization header', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = new UsageTracker({
        auth: createAuth('my-secret-key'),
        host: 'https://example.com',
        fetch: fetchMock,
      });

      tracker.trackRead();
      await tracker.shutdown();

      expect(getHeaders().Authorization).toBe('Bearer my-secret-key');
    });

    it('should send evaluating OIDC header when SDK key auth is used', async () => {
      getVercelOidcTokenMock.mockResolvedValue('oidc-token');
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker('my-secret-key');

      tracker.trackRead();
      await tracker.shutdown();

      expect(getHeaders().Authorization).toBe('Bearer my-secret-key');
      expect(getHeaders()[EVALUATING_OIDC_TOKEN_HEADER]).toBe('oidc-token');
    });

    it('should omit evaluating OIDC header when OIDC is unavailable', async () => {
      getVercelOidcTokenMock.mockRejectedValue(new Error('No OIDC'));
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker('my-secret-key');

      tracker.trackRead();
      await tracker.shutdown();

      expect(getHeaders().Authorization).toBe('Bearer my-secret-key');
      expect(getHeaders()[EVALUATING_OIDC_TOKEN_HEADER]).toBeUndefined();
    });

    it('should not send evaluating OIDC header when OIDC is primary auth', async () => {
      getVercelOidcTokenMock.mockResolvedValue('evaluating-oidc-token');
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = new UsageTracker({
        auth: {
          resolveToken: () => Promise.resolve('primary-oidc-token'),
          resolveBundledDefinitionsLookup: () =>
            Promise.resolve({ type: 'project-id', projectId: 'prj_123' }),
        },
        host: 'https://example.com',
        fetch: fetchMock,
      });

      tracker.trackRead();
      await tracker.shutdown();

      expect(getHeaders().Authorization).toBe('Bearer primary-oidc-token');
      expect(getHeaders()[EVALUATING_OIDC_TOKEN_HEADER]).toBeUndefined();
    });

    it('should send correct content-type header', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      tracker.trackRead();
      await tracker.shutdown();

      expect(getHeaders()['Content-Type']).toBe('application/json');
    });

    it('should send user-agent header', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      tracker.trackRead();
      await tracker.shutdown();

      expect(getHeaders()['User-Agent']).toMatch(/^VercelFlagsCore\//);
    });

    it('should send shutdown as the flush reason header for shutdown flushes', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      tracker.trackRead();
      await tracker.shutdown();

      expect(getHeaders()[FLUSH_REASON_HEADER]).toBe('shutdown');
    });

    it('should not send empty batches', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      // Shut down without tracking anything
      await tracker.shutdown();

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should handle fetch errors gracefully', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

      const tracker = createTracker();

      tracker.trackRead();
      await tracker.shutdown();

      // Should not throw, errors are logged via console.error
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should handle non-ok responses gracefully', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      fetchMock.mockResolvedValue(new Response(null, { status: 500 }));

      const tracker = createTracker();

      tracker.trackRead();
      await tracker.shutdown();

      // Should not throw, errors are logged via console.error
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should send x-vercel-debug-ingest header in debug mode', async () => {
      vi.stubEnv('DEBUG', '@vercel/flags-core');
      vi.resetModules();
      const { UsageTracker: FreshUsageTracker } = await import(
        './usage-tracker'
      );
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      fetchMock.mockImplementation(() =>
        jsonResponse(
          { ok: true },
          { headers: { 'x-vercel-id': 'iad1::abcdef-1234' } },
        ),
      );

      const tracker = new FreshUsageTracker({
        auth: createAuth('test-key'),
        host: 'https://example.com',
        fetch: fetchMock,
      });

      tracker.trackRead();
      await tracker.shutdown();

      expect(getHeaders()['x-vercel-debug-ingest']).toBe('1');
      expect(consoleSpy).toHaveBeenCalledWith(
        '@vercel/flags-core: Ingest response 200 for 1 events on iad1::abcdef-1234',
      );

      consoleSpy.mockRestore();
    });

    it('should not send x-vercel-debug-ingest header when not in debug mode', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      tracker.trackRead();
      await tracker.shutdown();

      expect(getHeaders()['x-vercel-debug-ingest']).toBeUndefined();
    });

    it('should log ingest response in debug mode', async () => {
      vi.stubEnv('DEBUG', '@vercel/flags-core');
      vi.resetModules();
      const { UsageTracker: FreshUsageTracker } = await import(
        './usage-tracker'
      );
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = new FreshUsageTracker({
        auth: createAuth('test-key'),
        host: 'https://example.com',
        fetch: fetchMock,
      });

      tracker.trackRead();
      await tracker.shutdown();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '@vercel/flags-core: Ingest response 200 for 1 events',
        ),
      );
    });
  });

  describe('trackEvaluation', () => {
    it('should aggregate matching evaluations into counted buckets', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      tracker.trackEvaluation({
        flagKey: 'flag-a',
        variant: 'var_enabled',
        reason: ResolutionReason.FALLTHROUGH,
        clientName: 'checkout',
      });
      tracker.trackEvaluation({
        flagKey: 'flag-a',
        variant: 'var_enabled',
        reason: ResolutionReason.FALLTHROUGH,
        clientName: 'checkout',
      });
      tracker.trackEvaluation({
        flagKey: 'flag-a',
        variant: 'var_disabled',
        reason: ResolutionReason.FALLTHROUGH,
        clientName: 'checkout',
      });

      await tracker.shutdown();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const events = getBody() as SerializedEvaluationEvent[];
      expect(events).toHaveLength(2);
      expect(events).toContainEqual(
        expect.objectContaining({
          type: 'FLAG_EVALUATION',
          payload: expect.objectContaining({
            flagKey: 'flag-a',
            variant: 'var_enabled',
            reason: ResolutionReason.FALLTHROUGH,
            clientName: 'checkout',
            evaluationCount: 2,
            periodStartedAt: expect.any(Number),
          }),
        }),
      );
      expect(events).toContainEqual(
        expect.objectContaining({
          payload: expect.objectContaining({
            flagKey: 'flag-a',
            variant: 'var_disabled',
            reason: ResolutionReason.FALLTHROUGH,
            clientName: 'checkout',
            evaluationCount: 1,
            periodStartedAt: expect.any(Number),
          }),
        }),
      );
    });

    it('should preserve evaluation timestamps and bucket periodStartedAt to the current minute', async () => {
      vi.useFakeTimers();
      const trackedAt = new Date('2026-01-01T00:00:15.123Z');
      const bucketTs = new Date('2026-01-01T00:00:00.000Z').getTime();
      vi.setSystemTime(trackedAt);
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      tracker.trackEvaluation({
        flagKey: 'flag-a',
        variant: 'var_enabled',
        reason: ResolutionReason.FALLTHROUGH,
      });
      vi.setSystemTime(new Date(trackedAt.getTime() + 10_000));
      await tracker.shutdown();

      const events = getBody() as SerializedEvaluationEvent[];
      expect(events[0]?.ts).toBe(trackedAt.getTime());
      expect(events[0]?.payload.periodStartedAt).toBe(bucketTs);
    });

    it('should keep exact minute boundaries in the same bucket', async () => {
      vi.useFakeTimers();
      const trackedAt = new Date('2026-01-01T00:01:00.000Z');
      vi.setSystemTime(trackedAt);
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      tracker.trackEvaluation({
        flagKey: 'flag-a',
        variant: 'var_enabled',
        reason: ResolutionReason.FALLTHROUGH,
      });

      await tracker.shutdown();

      const events = getBody() as SerializedEvaluationEvent[];
      expect(events[0]?.ts).toBe(trackedAt.getTime());
      expect(events[0]?.payload.periodStartedAt).toBe(trackedAt.getTime());
    });

    it('should aggregate matching evaluations in the same minute bucket', async () => {
      vi.useFakeTimers();
      const bucketTs = new Date('2026-01-01T00:00:00.000Z').getTime();
      vi.setSystemTime(new Date('2026-01-01T00:00:15.000Z'));
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      tracker.trackEvaluation({
        flagKey: 'flag-a',
        variant: 'var_enabled',
        reason: ResolutionReason.FALLTHROUGH,
      });
      vi.setSystemTime(new Date('2026-01-01T00:00:59.999Z'));
      tracker.trackEvaluation({
        flagKey: 'flag-a',
        variant: 'var_enabled',
        reason: ResolutionReason.FALLTHROUGH,
      });
      vi.setSystemTime(new Date('2026-01-01T00:01:10.000Z'));
      await tracker.shutdown();

      const events = getBody() as SerializedEvaluationEvent[];
      expect(events).toHaveLength(1);
      expect(events[0]?.ts).toBe(
        new Date('2026-01-01T00:00:15.000Z').getTime(),
      );
      expect(events[0]?.payload.periodStartedAt).toBe(bucketTs);
      expect(events[0]?.payload.evaluationCount).toBe(2);
    });

    it('should keep matching evaluations in different minute buckets separate', async () => {
      vi.useFakeTimers();
      const firstBucketTs = new Date('2026-01-01T00:00:00.000Z').getTime();
      const secondBucketTs = new Date('2026-01-01T00:01:00.000Z').getTime();
      vi.setSystemTime(new Date('2026-01-01T00:00:59.999Z'));
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      tracker.trackEvaluation({
        flagKey: 'flag-a',
        variant: 'var_enabled',
        reason: ResolutionReason.FALLTHROUGH,
      });
      vi.setSystemTime(new Date('2026-01-01T00:01:00.001Z'));
      tracker.trackEvaluation({
        flagKey: 'flag-a',
        variant: 'var_enabled',
        reason: ResolutionReason.FALLTHROUGH,
      });
      await tracker.shutdown();

      const events = getBody() as SerializedEvaluationEvent[];
      expect(events).toHaveLength(2);
      expect(events).toContainEqual({
        type: 'FLAG_EVALUATION',
        ts: new Date('2026-01-01T00:00:59.999Z').getTime(),
        payload: {
          flagKey: 'flag-a',
          variant: 'var_enabled',
          reason: ResolutionReason.FALLTHROUGH,
          evaluationCount: 1,
          periodStartedAt: firstBucketTs,
        },
      });
      expect(events).toContainEqual({
        type: 'FLAG_EVALUATION',
        ts: new Date('2026-01-01T00:01:00.001Z').getTime(),
        payload: {
          flagKey: 'flag-a',
          variant: 'var_enabled',
          reason: ResolutionReason.FALLTHROUGH,
          evaluationCount: 1,
          periodStartedAt: secondBucketTs,
        },
      });
    });

    it('should send read and evaluation events in the same flush payload', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      tracker.trackRead({ configOrigin: 'in-memory' });
      tracker.trackEvaluation({
        flagKey: 'flag-a',
        variant: 'var_0',
        reason: ResolutionReason.FALLTHROUGH,
      });
      await tracker.shutdown();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(getBody()).toEqual([
        expect.objectContaining({ type: 'FLAGS_CONFIG_READ' }),
        {
          type: 'FLAG_EVALUATION',
          ts: expect.any(Number),
          payload: {
            flagKey: 'flag-a',
            variant: 'var_0',
            reason: ResolutionReason.FALLTHROUGH,
            evaluationCount: 1,
            periodStartedAt: expect.any(Number),
          },
        },
      ]);
    });

    it('should reset the idle flush timer when evaluations keep arriving', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:10.000Z'));
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      tracker.trackEvaluation({
        flagKey: 'flag-a',
        variant: 'var_0',
        reason: ResolutionReason.FALLTHROUGH,
      });

      await vi.advanceTimersByTimeAsync(4999);
      expect(fetchMock).not.toHaveBeenCalled();

      tracker.trackEvaluation({
        flagKey: 'flag-a',
        variant: 'var_0',
        reason: ResolutionReason.FALLTHROUGH,
      });

      await vi.advanceTimersByTimeAsync(4999);
      expect(fetchMock).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);

      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });
      const events = getBody() as SerializedEvaluationEvent[];
      expect(events[0]?.payload.evaluationCount).toBe(2);
      expect(getHeaders()[FLUSH_REASON_HEADER]).toBe('idle_timeout');
    });

    it('should not count repeated evaluations of the same bucket toward the batch threshold', async () => {
      vi.useFakeTimers();
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      // Track the same bucket well past the 50-event threshold.
      for (let i = 0; i < 60; i++) {
        tracker.trackEvaluation({
          flagKey: 'flag-a',
          variant: 'var_0',
          reason: ResolutionReason.FALLTHROUGH,
        });
      }

      // No count-based flush should fire (a single distinct bucket).
      await vi.advanceTimersByTimeAsync(4999);
      expect(fetchMock).not.toHaveBeenCalled();

      // The aggregated event still carries the full repeated count.
      await tracker.shutdown();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const events = getBody() as SerializedEvaluationEvent[];
      expect(events).toHaveLength(1);
      expect(events[0]?.payload.evaluationCount).toBe(60);
      expect(getHeaders()[FLUSH_REASON_HEADER]).toBe('shutdown');
    });

    it('should track when request context is unavailable', async () => {
      cleanupContext?.();
      cleanupContext = undefined;
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      tracker.trackEvaluation({
        flagKey: 'flag-a',
        variant: 'var_0',
        reason: ResolutionReason.FALLTHROUGH,
      });
      await tracker.shutdown();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(getBody()).toEqual([
        {
          type: 'FLAG_EVALUATION',
          ts: expect.any(Number),
          payload: {
            flagKey: 'flag-a',
            variant: 'var_0',
            reason: ResolutionReason.FALLTHROUGH,
            evaluationCount: 1,
            periodStartedAt: expect.any(Number),
          },
        },
      ]);
    });
  });

  describe('shutdown', () => {
    it('should trigger immediate flush of pending events', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      tracker.trackRead();

      // Shut down immediately instead of waiting for timeout
      await tracker.shutdown();

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('should keep the waitUntil promise pending until the scheduled ingest completes', async () => {
      vi.useFakeTimers();
      const fetchDeferred = deferred<Response>();
      fetchMock.mockImplementation(() => fetchDeferred.promise);

      const tracker = createTracker();
      tracker.trackRead();

      // Trigger the scheduled flush via the idle window.
      await vi.advanceTimersByTimeAsync(5000);

      expect(waitUntilMock).toHaveBeenCalledTimes(1);
      const pending = waitUntilMock.mock.calls[0]![0] as Promise<void>;
      let settled = false;
      void pending.then(() => {
        settled = true;
      });

      // Ingest has started but not resolved; the waitUntil promise must wait.
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(getHeaders()[FLUSH_REASON_HEADER]).toBe('idle_timeout');
      expect(settled).toBe(false);

      fetchDeferred.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      await pending;
      expect(settled).toBe(true);
    });

    it('should drain a pending scheduled batch without double-sending', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      // Both events sit in a pending scheduled batch (idle timer running).
      tracker.trackRead();
      tracker.trackEvaluation({
        flagKey: 'flag-a',
        variant: 'var_0',
        reason: ResolutionReason.FALLTHROUGH,
      });

      await tracker.shutdown();

      // Exactly one ingest batch carrying both events; the trailing
      // safety-net flush is a no-op (maps already cleared).
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(getBody()).toHaveLength(2);
      expect(getHeaders()[FLUSH_REASON_HEADER]).toBe('shutdown');
    });

    it('should send max_timeout as the flush reason header for max-window flushes', async () => {
      vi.useFakeTimers();
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      tracker.trackEvaluation({
        flagKey: 'flag-a',
        variant: 'var_0',
        reason: ResolutionReason.FALLTHROUGH,
      });

      for (let elapsed = 0; elapsed < 56000; elapsed += 4000) {
        await vi.advanceTimersByTimeAsync(4000);
        expect(fetchMock).not.toHaveBeenCalled();
        tracker.trackEvaluation({
          flagKey: 'flag-a',
          variant: 'var_0',
          reason: ResolutionReason.FALLTHROUGH,
        });
      }

      await vi.advanceTimersByTimeAsync(4000);

      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });
      expect(getHeaders()[FLUSH_REASON_HEADER]).toBe('max_timeout');
    });

    it('should be safe to call shutdown multiple times', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      tracker.trackRead();
      await tracker.shutdown();
      await tracker.shutdown();
      await tracker.shutdown();

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('request context deduplication', () => {
    it('should deduplicate events with the same request context', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const cleanupContext = setRequestContext({
        'x-vercel-id': 'test-request-id',
        host: 'example.com',
      });

      const tracker = createTracker();

      // Track multiple times with same context
      tracker.trackRead();
      tracker.trackRead();
      tracker.trackRead();
      await tracker.shutdown();

      // Only one event should be recorded due to deduplication
      const events = getBody() as Array<{ type: string }>;
      expect(events).toHaveLength(1);

      cleanupContext();
    });

    it('should include headers from request context', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const cleanupContext = setRequestContext({
        'x-vercel-id': 'req_123',
        host: 'myapp.vercel.app',
      });

      const tracker = createTracker();

      tracker.trackRead();
      await tracker.shutdown();

      const events = getBody() as SerializedConfigReadEvent[];
      const event = events[0] as SerializedConfigReadEvent;
      expect(event.payload.vercelRequestId).toBe('req_123');
      expect(event.payload.invocationHost).toBe('myapp.vercel.app');

      cleanupContext();
    });
  });

  describe('cross-instance deduplication', () => {
    it('should not deduplicate across separate UsageTracker instances', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const cleanupContext = setRequestContext({
        'x-vercel-id': 'shared-request-id',
        host: 'example.com',
      });

      const tracker1 = new UsageTracker({
        auth: createAuth('key-1'),
        host: 'https://example.com',
        fetch: fetchMock,
      });

      const tracker2 = new UsageTracker({
        auth: createAuth('key-2'),
        host: 'https://example.com',
        fetch: fetchMock,
      });

      // Both trackers track with the same request context
      tracker1.trackRead();
      tracker2.trackRead();
      await tracker1.shutdown();
      await tracker2.shutdown();

      // Each tracker should have sent its own event
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(getBody(0)).toHaveLength(1);
      expect(getBody(1)).toHaveLength(1);

      cleanupContext();
    });
  });

  describe('retry behavior', () => {
    it('should retry on non-ok response and succeed', async () => {
      let requestCount = 0;
      fetchMock.mockImplementation(async () => {
        requestCount++;
        if (requestCount < 3) {
          return new Response('Internal Server Error', { status: 500 });
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const tracker = createTracker();

      tracker.trackRead();
      await tracker.shutdown();

      // 2 failed + 1 success = 3 total
      expect(requestCount).toBe(3);
    });

    it('should retry on fetch error and succeed', async () => {
      let requestCount = 0;
      fetchMock.mockImplementation(async () => {
        requestCount++;
        if (requestCount < 3) {
          throw new TypeError('Failed to fetch');
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const tracker = createTracker();

      tracker.trackRead();
      await tracker.shutdown();

      // 2 failed + 1 success = 3 total
      expect(requestCount).toBe(3);
    });

    it('should log a structured warning when all retries are exhausted', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      fetchMock.mockResolvedValue(new Response('err', { status: 500 }));

      const tracker = createTracker();
      tracker.trackRead();
      await tracker.shutdown();

      // All 3 attempts fail; SDK logs an extra "Dropped" line
      expect(fetchMock).toHaveBeenCalledTimes(3);
      const droppedLogs = consoleSpy.mock.calls.filter(
        ([msg]) =>
          typeof msg === 'string' && msg.includes('Dropped 1 events after 3'),
      );
      expect(droppedLogs).toHaveLength(1);

      consoleSpy.mockRestore();
    });

    it('should not log the exhaustion warning when a retry eventually succeeds', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      let requestCount = 0;
      fetchMock.mockImplementation(async () => {
        requestCount++;
        if (requestCount < 3) {
          return new Response('err', { status: 500 });
        }
        return jsonResponse({ ok: true });
      });

      const tracker = createTracker();
      tracker.trackRead();
      await tracker.shutdown();

      const droppedLogs = consoleSpy.mock.calls.filter(
        ([msg]) => typeof msg === 'string' && msg.includes('Dropped'),
      );
      expect(droppedLogs).toHaveLength(0);

      consoleSpy.mockRestore();
    });
  });

  describe('batch size limit', () => {
    it('should trigger flush when batch size reaches 2000', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      // Track 2000 events with different request contexts to avoid deduplication
      for (let i = 0; i < 2000; i++) {
        cleanupContext?.();
        cleanupContext = setRequestContext({
          host: 'example.com',
          'x-vercel-id': `req-${i}`,
        });
        tracker.trackRead();
      }

      // Should auto-flush at 2000 events — wait for the scheduled flush
      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });

      const events = getBody() as Array<{ type: string }>;
      expect(events).toHaveLength(2000);
      expect(getHeaders()[FLUSH_REASON_HEADER]).toBe('max_count');
    });

    it('should split a flush of more than 2000 events into multiple POSTs', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      // Synchronously track 2500 distinct events. The scheduler resolves the
      // max_count flush at 2000, but the flush reads the event maps in a
      // microtask that only runs after this loop, so the batch overshoots.
      for (let i = 0; i < 2500; i++) {
        tracker.trackEvaluation({
          flagKey: `flag-${i}`,
          variant: 'var_0',
          reason: ResolutionReason.FALLTHROUGH,
        });
      }

      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(2);
      });

      // Each POST stays at or below the 2000-event chunk size, and both
      // chunks belong to the same flush (same flush reason header).
      expect(getBody(0)).toHaveLength(2000);
      expect(getBody(1)).toHaveLength(500);
      expect(getHeaders(0)[FLUSH_REASON_HEADER]).toBe('max_count');
      expect(getHeaders(1)[FLUSH_REASON_HEADER]).toBe('max_count');

      // Everything was sent; shutdown has nothing left to flush.
      await tracker.shutdown();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('error handling in trackRead', () => {
    it('should catch and log errors without throwing', async () => {
      // Set up a broken request context that throws
      const SYMBOL_FOR_REQ_CONTEXT = Symbol.for('@vercel/request-context');
      (globalThis as any)[SYMBOL_FOR_REQ_CONTEXT] = {
        get: () => {
          throw new Error('Context error');
        },
      };

      const tracker = createTracker();

      // Should not throw
      expect(() => tracker.trackRead()).not.toThrow();

      // Clean up
      delete (globalThis as any)[SYMBOL_FOR_REQ_CONTEXT];
    });
  });

  describe('trackRead options', () => {
    it('should include configOrigin in the event payload', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      tracker.trackRead({ configOrigin: 'in-memory' });
      await tracker.shutdown();

      const events = getBody() as SerializedConfigReadEvent[];
      const event = events[0] as SerializedConfigReadEvent;
      expect(event.payload.configOrigin).toBe('in-memory');
    });

    it('should include cacheStatus in the event payload', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      tracker.trackRead({ configOrigin: 'in-memory', cacheStatus: 'HIT' });
      await tracker.shutdown();

      const events = getBody() as SerializedConfigReadEvent[];
      const event = events[0] as SerializedConfigReadEvent;
      expect(event.payload.cacheStatus).toBe('HIT');
    });

    it('should include cacheIsFirstRead in the event payload', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      tracker.trackRead({ configOrigin: 'in-memory', cacheIsFirstRead: true });
      await tracker.shutdown();

      const events = getBody() as SerializedConfigReadEvent[];
      const event = events[0] as SerializedConfigReadEvent;
      expect(event.payload.cacheIsFirstRead).toBe(true);
    });

    it('should include cacheIsBlocking in the event payload', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      tracker.trackRead({ configOrigin: 'in-memory', cacheIsBlocking: true });
      await tracker.shutdown();

      const events = getBody() as SerializedConfigReadEvent[];
      const event = events[0] as SerializedConfigReadEvent;
      expect(event.payload.cacheIsBlocking).toBe(true);
    });

    it('should include duration in the event payload', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      tracker.trackRead({ configOrigin: 'in-memory', duration: 150 });
      await tracker.shutdown();

      const events = getBody() as SerializedConfigReadEvent[];
      const event = events[0] as SerializedConfigReadEvent;
      expect(event.payload.duration).toBe(150);
    });

    it('should include configUpdatedAt in the event payload', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      const timestamp = Date.now();
      tracker.trackRead({
        configOrigin: 'in-memory',
        configUpdatedAt: timestamp,
      });
      await tracker.shutdown();

      const events = getBody() as SerializedConfigReadEvent[];
      const event = events[0] as SerializedConfigReadEvent;
      expect(event.payload.configUpdatedAt).toBe(timestamp);
    });

    it('should include all options in the event payload', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      const timestamp = Date.now();
      tracker.trackRead({
        configOrigin: 'in-memory',
        cacheStatus: 'MISS',
        cacheIsFirstRead: true,
        cacheIsBlocking: true,
        duration: 200,
        configUpdatedAt: timestamp,
      });
      await tracker.shutdown();

      const events = getBody() as SerializedConfigReadEvent[];
      const event = events[0] as SerializedConfigReadEvent;
      expect(event.payload.configOrigin).toBe('in-memory');
      expect(event.payload.cacheStatus).toBe('MISS');
      expect(event.payload.cacheIsFirstRead).toBe(true);
      expect(event.payload.cacheIsBlocking).toBe(true);
      expect(event.payload.duration).toBe(200);
      expect(event.payload.configUpdatedAt).toBe(timestamp);
    });

    it('should omit undefined options from the event payload', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      // Only pass configOrigin, omit others
      tracker.trackRead({ configOrigin: 'embedded' });
      await tracker.shutdown();

      const events = getBody() as SerializedConfigReadEvent[];
      const event = events[0] as SerializedConfigReadEvent;
      expect(event.payload.configOrigin).toBe('embedded');
      expect(event.payload.cacheStatus).toBeUndefined();
      expect(event.payload.cacheIsFirstRead).toBeUndefined();
      expect(event.payload.cacheIsBlocking).toBeUndefined();
      expect(event.payload.duration).toBeUndefined();
      expect(event.payload.configUpdatedAt).toBeUndefined();
    });
  });
});
