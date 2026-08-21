import { waitUntil } from '@vercel/functions';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Scheduler } from './scheduler';

vi.mock('@vercel/functions', () => ({
  waitUntil: vi.fn(),
}));

const waitUntilMock = vi.mocked(waitUntil);

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('Scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    waitUntilMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('flushes after the idle window', async () => {
    const onFlush = vi.fn();
    const scheduler = new Scheduler(onFlush);

    scheduler.scheduleFlush();

    await vi.advanceTimersByTimeAsync(4999);
    expect(onFlush).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    await vi.waitFor(() => {
      expect(onFlush).toHaveBeenCalledTimes(1);
    });
    expect(onFlush).toHaveBeenCalledWith('idle_timeout');
  });

  it('applies jitter to the idle window', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const onFlush = vi.fn();
    const scheduler = new Scheduler(onFlush);

    scheduler.scheduleFlush();

    await vi.advanceTimersByTimeAsync(3999);
    expect(onFlush).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    await vi.waitFor(() => {
      expect(onFlush).toHaveBeenCalledTimes(1);
    });
    expect(onFlush).toHaveBeenCalledWith('idle_timeout');
  });

  it('resets the idle window when a new flush is scheduled', async () => {
    const onFlush = vi.fn();
    const scheduler = new Scheduler(onFlush);

    scheduler.scheduleFlush();
    await vi.advanceTimersByTimeAsync(4999);

    scheduler.scheduleFlush();
    await vi.advanceTimersByTimeAsync(4999);
    expect(onFlush).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    await vi.waitFor(() => {
      expect(onFlush).toHaveBeenCalledTimes(1);
    });
    expect(onFlush).toHaveBeenCalledWith('idle_timeout');
  });

  it('registers the scheduled flush with waitUntil', () => {
    const scheduler = new Scheduler(vi.fn());

    scheduler.scheduleFlush();

    expect(waitUntilMock).toHaveBeenCalledTimes(1);
    expect(waitUntilMock).toHaveBeenCalledWith(expect.any(Promise));
  });

  it('starts a fresh batch after a flush completes', async () => {
    const onFlush = vi.fn();
    const scheduler = new Scheduler(onFlush);

    scheduler.scheduleFlush();
    await vi.advanceTimersByTimeAsync(5000);

    await vi.waitFor(() => {
      expect(onFlush).toHaveBeenCalledTimes(1);
    });
    expect(onFlush).toHaveBeenNthCalledWith(1, 'idle_timeout');

    // A new batch should accumulate independently and flush again.
    scheduler.scheduleFlush();
    await vi.advanceTimersByTimeAsync(5000);

    await vi.waitFor(() => {
      expect(onFlush).toHaveBeenCalledTimes(2);
    });
  });

  it('does not resolve the waitUntil promise until the async flush completes', async () => {
    const flushDeferred = deferred();
    const onFlush = vi.fn(() => flushDeferred.promise);
    const scheduler = new Scheduler(onFlush);

    scheduler.scheduleFlush();

    const pending = waitUntilMock.mock.calls[0]![0] as Promise<void>;
    let settled = false;
    void pending.then(() => {
      settled = true;
    });

    // Trigger the flush via the idle window.
    await vi.advanceTimersByTimeAsync(5000);

    // onFlush has been invoked, but the pending promise must not resolve yet.
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith('idle_timeout');
    expect(settled).toBe(false);

    flushDeferred.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(true);
  });

  it('flushes at the max window under continuous traffic', async () => {
    const onFlush = vi.fn();
    const scheduler = new Scheduler(onFlush);

    // Keep scheduling every 4s so the 5s idle timer never fires.
    scheduler.scheduleFlush();
    for (let elapsed = 0; elapsed < 56000; elapsed += 4000) {
      await vi.advanceTimersByTimeAsync(4000);
      expect(onFlush).not.toHaveBeenCalled();
      scheduler.scheduleFlush();
    }

    // At the 60s mark since the first event, the max window fires.
    await vi.advanceTimersByTimeAsync(4000);

    await vi.waitFor(() => {
      expect(onFlush).toHaveBeenCalledTimes(1);
    });
    expect(onFlush).toHaveBeenCalledWith('max_timeout');
  });

  it('resolves a pending flush on shutdown', async () => {
    const onFlush = vi.fn();
    const scheduler = new Scheduler(onFlush);

    scheduler.scheduleFlush();

    await scheduler.shutdown();

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith('shutdown');
  });

  it('shutdown resolves without hanging when nothing is pending', async () => {
    const onFlush = vi.fn();
    const scheduler = new Scheduler(onFlush);

    await scheduler.shutdown();

    expect(onFlush).not.toHaveBeenCalled();
  });

  it('shutdown awaits the in-flight ingest', async () => {
    const flushDeferred = deferred();
    const onFlush = vi.fn(() => flushDeferred.promise);
    const scheduler = new Scheduler(onFlush);

    scheduler.scheduleFlush();

    let shutdownResolved = false;
    const shutdownPromise = scheduler.shutdown().then(() => {
      shutdownResolved = true;
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith('shutdown');
    expect(shutdownResolved).toBe(false);

    flushDeferred.resolve();
    await shutdownPromise;
    expect(shutdownResolved).toBe(true);
  });
});
