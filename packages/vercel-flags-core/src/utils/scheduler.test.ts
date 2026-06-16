import { waitUntil } from '@vercel/functions';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Scheduler } from './scheduler';

vi.mock('@vercel/functions', () => ({
  waitUntil: vi.fn(),
}));

const waitUntilMock = vi.mocked(waitUntil);

describe('Scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    waitUntilMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('emits flush after the idle window', async () => {
    const scheduler = new Scheduler();
    const onFlush = vi.fn();
    scheduler.on('flush', onFlush);

    scheduler.scheduleFlush();

    await vi.advanceTimersByTimeAsync(4999);
    expect(onFlush).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    await vi.waitFor(() => {
      expect(onFlush).toHaveBeenCalledTimes(1);
    });
  });

  it('resets the idle window when a new flush is scheduled', async () => {
    const scheduler = new Scheduler();
    const onFlush = vi.fn();
    scheduler.on('flush', onFlush);

    scheduler.scheduleFlush();
    await vi.advanceTimersByTimeAsync(4999);

    scheduler.scheduleFlush();
    await vi.advanceTimersByTimeAsync(4999);
    expect(onFlush).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    await vi.waitFor(() => {
      expect(onFlush).toHaveBeenCalledTimes(1);
    });
  });

  it('emits flush when the count reaches the max batch size', async () => {
    const scheduler = new Scheduler();
    const onFlush = vi.fn();
    scheduler.on('flush', onFlush);

    scheduler.scheduleFlush();
    for (let i = 0; i < 49; i++) {
      scheduler.increment();
    }
    expect(onFlush).not.toHaveBeenCalled();

    scheduler.increment();

    await vi.waitFor(() => {
      expect(onFlush).toHaveBeenCalledTimes(1);
    });
  });

  it('registers the scheduled flush with waitUntil', () => {
    const scheduler = new Scheduler();

    scheduler.scheduleFlush();

    expect(waitUntilMock).toHaveBeenCalledTimes(1);
    expect(waitUntilMock).toHaveBeenCalledWith(expect.any(Promise));
  });

  it('clears pending timers and count', async () => {
    const scheduler = new Scheduler();
    const onFlush = vi.fn();
    scheduler.on('flush', onFlush);

    scheduler.scheduleFlush();
    for (let i = 0; i < 49; i++) {
      scheduler.increment();
    }

    scheduler.clearAll();
    await vi.advanceTimersByTimeAsync(5000);
    expect(onFlush).not.toHaveBeenCalled();

    scheduler.scheduleFlush();
    for (let i = 0; i < 49; i++) {
      scheduler.increment();
    }
    expect(onFlush).not.toHaveBeenCalled();

    scheduler.increment();

    await vi.waitFor(() => {
      expect(onFlush).toHaveBeenCalledTimes(1);
    });
  });
});
