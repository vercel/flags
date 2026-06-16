import { waitUntil } from '@vercel/functions';
import { TypedEmitter } from '../controller/typed-emitter';

const MAX_COUNT = 50;
const IDLE_FLUSH_WAIT_MS = 5000;

export type SchedulerEvents = {
  flush: () => void;
};

/**
 * Schedule helper that flushes either after a batch size is reached or after an idle period
 */
export class Scheduler extends TypedEmitter<SchedulerEvents> {
  private count: number = 0;
  private resolveWait: (() => void) | null = null;
  private pending: null | Promise<void> = null;
  private timeout: null | ReturnType<typeof setTimeout> = null;

  increment(): void {
    this.count += 1;

    // immediately flush if we've reached the batch size
    if (this.count >= MAX_COUNT) {
      this.resolveScheduledFlush();
    }
  }

  clearAll(): void {
    this.pending = null;
    this.resolveWait = null;
    this.count = 0;
    this.clearTimeout();
  }

  scheduleFlush(): void {
    if (!this.pending) {
      const pending = (async () => {
        // wait for timeout or event count to reach batch size
        await new Promise<void>((res) => {
          this.resolveWait = res;
        });

        this.clearAll();

        await this.flushEvents();
      })();

      try {
        waitUntil(pending);
      } catch {
        // waitUntil is best-effort; falling through leaves a floating promise
      }

      this.pending = pending;
    }

    this.resetTimeout();
  }

  private resetTimeout(): void {
    this.clearTimeout();
    this.timeout = setTimeout(
      () => this.resolveScheduledFlush(),
      IDLE_FLUSH_WAIT_MS,
    );
  }

  private resolveScheduledFlush(): void {
    this.clearTimeout();
    this.resolveWait?.();
  }

  private clearTimeout(): void {
    if (!this.timeout) return;
    clearTimeout(this.timeout);
    this.timeout = null;
  }

  private async flushEvents(): Promise<void> {
    this.emit('flush');
  }
}
