import { type IngestOptions, sendIngestEvents } from './ingest';
import { getRequestContext } from './request-context';
import { Scheduler } from './scheduler';
import {
  FlagsConfigReadEvent,
  type TrackReadOptions,
} from './usage/flags-config-read';
import {
  evaluationBatchKey,
  FlagsEvaluationEvent,
  type TrackEvaluationOptions,
} from './usage/flags-evaluation';
import { BetterWeakMap } from './weak-map';

/**
 * Tracks usage events and batches them for submission to the ingest endpoint.
 */
export class UsageTracker {
  private flushCount: number = 0;

  private options: IngestOptions;
  private scheduler: Scheduler;

  private readEvents = new BetterWeakMap<object, FlagsConfigReadEvent>();
  private evaluationEvents = new Map<string, FlagsEvaluationEvent>();

  constructor(options: IngestOptions) {
    this.options = options;
    this.scheduler = new Scheduler();

    this.scheduler.on('flush', () => {
      this.flushEvents();
    });
  }

  /**
   * Triggers an immediate flush of any pending events.
   * Returns a promise that resolves when the flush completes.
   */
  async shutdown() {
    this.scheduler.clearAll();

    await this.flushEvents();
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
      if (this.readEvents.has(ctx)) {
        return;
      }

      this.readEvents.set(ctx, new FlagsConfigReadEvent(headers, options));

      // always schedule and increment since we are adding a new event here
      this.scheduler.scheduleFlush();
      this.scheduler.increment();
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
      const batchKey = evaluationBatchKey(options);

      const existingEvent = this.evaluationEvents.get(batchKey);
      // increment if we already have an event for this batch key
      if (existingEvent) {
        existingEvent.increment();
      } else {
        this.evaluationEvents.set(batchKey, new FlagsEvaluationEvent(options));

        // only increment the scheduler if we are adding a new event
        this.scheduler.increment();
      }

      // always schedule to reset the timer
      this.scheduler.scheduleFlush();
    } catch (error) {
      console.error(
        '@vercel/flags-core: Failed to record evaluation event:',
        error,
      );
    }
  }

  /**
   * Send all events to the ingest service
   */
  private async flushEvents() {
    const events = [
      ...this.readEvents.values(),
      ...this.evaluationEvents.values(),
    ];
    if (events.length === 0) return;

    this.flushCount += 1;
    const flushId = this.flushCount;

    this.readEvents.clear();
    this.evaluationEvents.clear();

    await sendIngestEvents(this.options, events, flushId);
  }
}
