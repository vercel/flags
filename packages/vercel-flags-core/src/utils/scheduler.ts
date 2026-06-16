import { waitUntil } from '@vercel/functions';
import { getJitteredWaitMs } from './backoff';

const MAX_COUNT = 50;
const IDLE_FLUSH_WAIT_MS = 5000;
const IDLE_FLUSH_JITTER_RATIO = 0.2;
const MAX_FLUSH_WAIT_MS = 60000;

/**
 * Schedule helper that flushes when any of the following occur:
 * - the batch size is reached ({@link MAX_COUNT} distinct events),
 * - the idle window elapses ({@link IDLE_FLUSH_WAIT_MS}, reset on every event), or
 * - the max window elapses ({@link MAX_FLUSH_WAIT_MS}, starts with the batch and is
 *   never reset, so a batch always flushes under continuous traffic).
 *
 * The scheduled flush awaits {@link onFlush} (including its ingest send + retries),
 * so the promise handed to `waitUntil` does not resolve until ingest completes.
 */
export class Scheduler {
  private count: number = 0;
  private resolveWait: (() => void) | null = null;
  private pending: null | Promise<void> = null;
  private idleTimeout: null | ReturnType<typeof setTimeout> = null;
  private maxTimeout: null | ReturnType<typeof setTimeout> = null;

  constructor(private readonly onFlush: () => void | Promise<void>) {}

  increment(): void {
    this.count += 1;

    // immediately flush if we've reached the batch size
    if (this.count >= MAX_COUNT) {
      this.resolveScheduledFlush();
    }
  }

  scheduleFlush(): void {
    if (!this.pending) {
      this.pending = (async () => {
        // wait for a timeout or the event count to reach the batch size
        await new Promise<void>((res) => {
          this.resolveWait = res;
        });

        // free state so new events start a fresh batch while ingest runs
        this.reset();

        // genuinely await ingest (incl. retries) so waitUntil covers the send
        await this.onFlush();
      })();

      try {
        waitUntil(this.pending);
      } catch {
        // waitUntil is best-effort; falling through leaves a floating promise
      }

      // max window: starts with the batch and is never reset
      this.maxTimeout = setTimeout(
        () => this.resolveScheduledFlush(),
        MAX_FLUSH_WAIT_MS,
      );
    }

    // idle window: reset on every event
    this.resetIdleTimeout();
  }

  /**
   * Resolves any in-flight scheduled flush and waits for its ingest to finish.
   */
  async shutdown(): Promise<void> {
    this.clearTimeouts();
    const pending = this.pending;
    this.resolveWait?.();
    if (pending) await pending;
  }

  private resetIdleTimeout(): void {
    if (this.idleTimeout) clearTimeout(this.idleTimeout);
    this.idleTimeout = setTimeout(
      () => this.resolveScheduledFlush(),
      getJitteredWaitMs(IDLE_FLUSH_WAIT_MS, IDLE_FLUSH_JITTER_RATIO),
    );
  }

  private resolveScheduledFlush(): void {
    this.clearTimeouts();
    this.resolveWait?.();
  }

  private reset(): void {
    this.pending = null;
    this.resolveWait = null;
    this.count = 0;
    this.clearTimeouts();
  }

  private clearTimeouts(): void {
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
      this.idleTimeout = null;
    }
    if (this.maxTimeout) {
      clearTimeout(this.maxTimeout);
      this.maxTimeout = null;
    }
  }
}
