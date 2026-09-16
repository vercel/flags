import type { WaitUntil } from '../types';
import { type IngestOptions, sendIngestEvents } from './ingest';
import { getRequestContext } from './request-context';
import { getRuntimeIngest } from './runtime-ingest';
import { type FlushReason, Scheduler } from './scheduler';
import {
  FlagsConfigReadEvent,
  type TrackReadOptions,
} from './usage/flags-config-read';
import {
  evaluationBatchKey,
  FlagsEvaluationEvent,
  minuteBucketTs,
  type TrackEvaluationOptions,
} from './usage/flags-evaluation';

/**
 * Tracks usage events and batches them for submission to the ingest endpoint.
 */
export class UsageTracker {
  private flushCount: number = 0;

  private options: IngestOptions;
  private scheduler: Scheduler;
  private waitUntil: WaitUntil;
  private inflightFlushes = new Set<Promise<void>>();

  private trackedRequests = new WeakSet<object>();

  private readEvents: FlagsConfigReadEvent[] = [];
  private evaluationEvents = new Map<string, FlagsEvaluationEvent>();

  constructor(options: IngestOptions & { waitUntil: WaitUntil }) {
    this.options = options;
    this.waitUntil = options.waitUntil;
    this.scheduler = new Scheduler(
      (reason) => this.flushEvents(reason),
      options.waitUntil,
    );
  }

  /**
   * Triggers an immediate flush of any pending events.
   * Returns a promise that resolves when the flush completes.
   */
  async shutdown() {
    // Drain any in-flight scheduled batch (incl. its ingest send).
    await this.scheduler.shutdown();

    // Safety net for events tracked after the drained batch reset; if the
    // drained flush already sent everything this returns early (maps cleared).
    await this.flushEvents('shutdown');

    // Drain immediate flushes whose events fell back to the HTTP transport;
    // their events left the maps before the async send started, so the flush
    // above cannot cover them.
    await Promise.all([...this.inflightFlushes]);
  }

  /**
   * Tracks a config read event. Deduplicates by request context.
   */
  trackRead(options?: TrackReadOptions): void {
    try {
      const { ctx, headers } = getRequestContext();

      // Skip if request context can't be inferred
      if (!ctx) return;

      // Skip if we've already tracked this request
      if (this.trackedRequests.has(ctx)) return;
      this.trackedRequests.add(ctx);

      this.readEvents.push(new FlagsConfigReadEvent(headers, options));

      this.requestFlush();
    } catch (error) {
      // trackRead should never throw, but log the error
      console.error('@vercel/flags-core: Failed to record event:', error);
    }
  }

  /**
   * Tracks a flag evaluation event.
   */
  trackEvaluation(options: TrackEvaluationOptions): void {
    try {
      const bucketedOptions = {
        ...options,
        bucketTs: minuteBucketTs(),
      };
      const batchKey = evaluationBatchKey(bucketedOptions);

      const existingEvent = this.evaluationEvents.get(batchKey);
      // increment if we already have an event for this batch key
      if (existingEvent) {
        existingEvent.increment();
      } else {
        this.evaluationEvents.set(
          batchKey,
          new FlagsEvaluationEvent(bucketedOptions),
        );
      }

      // always schedule to reset the timer
      this.requestFlush();
    } catch (error) {
      console.error(
        '@vercel/flags-core: Failed to record evaluation event:',
        error,
      );
    }
  }

  /**
   * Flushes immediately when the runtime provides an ingest transport,
   * otherwise falls back to the time-based scheduler.
   */
  private requestFlush(): void {
    if (getRuntimeIngest()) {
      // Track the flush so shutdown() can drain it: events the runtime does
      // not accept fall back to the async HTTP transport, which outlives this
      // synchronous call. When the runtime accepts everything the promise is
      // already settled, so neither waitUntil nor shutdown() waits on it.
      const flush = this.flushEvents('immediate').catch((error) => {
        console.error('@vercel/flags-core: Failed to flush events:', error);
      });
      this.inflightFlushes.add(flush);
      void flush.finally(() => this.inflightFlushes.delete(flush));
      try {
        this.waitUntil?.(flush);
      } catch {
        // waitUntil is best-effort; shutdown() still drains the flush.
      }
    } else {
      this.scheduler.scheduleFlush();
    }
  }

  /**
   * Send all events to the ingest service
   */
  private async flushEvents(flushReason: FlushReason) {
    const events = [...this.readEvents, ...this.evaluationEvents.values()];
    if (events.length === 0) return;

    this.flushCount += 1;
    const flushId = this.flushCount;

    this.readEvents = [];
    this.evaluationEvents.clear();

    await sendIngestEvents(this.options, events, flushId, flushReason);
  }
}
