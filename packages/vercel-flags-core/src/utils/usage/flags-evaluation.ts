import type { ResolutionReason, VariantId } from '../../types';
import type { UsageEvent } from './events';

export interface TrackEvaluationOptions {
  flagKey: string;
  variant: VariantId | null;
  reason: ResolutionReason;
  clientName?: string;
}

const MINUTE_MS = 60_000;

export function minuteBucketTs(ts = Date.now()): number {
  return Math.floor(ts / MINUTE_MS) * MINUTE_MS;
}

export type BucketedTrackEvaluationOptions = TrackEvaluationOptions & {
  bucketTs: number;
};

export function evaluationBatchKey(
  options: BucketedTrackEvaluationOptions,
): string {
  return JSON.stringify([
    options.flagKey,
    options.variant,
    options.reason,
    options.clientName ?? null,
    options.bucketTs,
  ]);
}

export class FlagsEvaluationEvent implements UsageEvent {
  private readonly ts = Date.now();

  payload: {
    flagKey: string;
    variant?: string;
    reason: ResolutionReason;
    clientName?: string;
    evaluationCount: number;
    periodStartedAt: number;
  };

  constructor(eventOptions: BucketedTrackEvaluationOptions) {
    this.payload = {
      flagKey: eventOptions.flagKey,
      variant: eventOptions.variant ?? undefined,
      reason: eventOptions.reason,
      evaluationCount: 1,
      periodStartedAt: eventOptions.bucketTs,
    };

    if (eventOptions.clientName) {
      this.payload.clientName = eventOptions.clientName;
    }
  }

  increment(): void {
    this.payload.evaluationCount += 1;
  }

  ingestEvent() {
    return {
      type: 'FLAG_EVALUATION' as const,
      ts: this.ts,
      payload: this.payload,
    };
  }
}
