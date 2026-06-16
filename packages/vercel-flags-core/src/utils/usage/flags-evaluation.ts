import type { ResolutionReason } from '../../types';
import type { UsageEvent } from './events';

export interface TrackEvaluationOptions {
  flagKey: string;
  variant: string;
  reason: ResolutionReason;
  clientName?: string;
}

export function evaluationBatchKey(options: TrackEvaluationOptions): string {
  return JSON.stringify([
    options.flagKey,
    options.variant,
    options.reason,
    options.clientName ?? null,
  ]);
}

export class FlagsEvaluationEvent implements UsageEvent {
  payload: {
    flagKey: string;
    variant: string;
    reason: ResolutionReason;
    clientName?: string;
    count: number;
  };

  constructor(eventOptions: TrackEvaluationOptions) {
    this.payload = {
      flagKey: eventOptions.flagKey,
      variant: eventOptions.variant,
      reason: eventOptions.reason,
      count: 1,
    };

    if (eventOptions.clientName) {
      this.payload.clientName = eventOptions.clientName;
    }

    Object.defineProperty(this, 'batchKey', {
      value: JSON.stringify([
        this.payload.flagKey,
        this.payload.variant,
        this.payload.reason,
        this.payload.clientName ?? null,
      ]),
      enumerable: false,
    });
  }

  increment(): void {
    this.payload.count += 1;
  }

  ingestEvent() {
    return {
      type: 'FLAGS_EVALUATION' as const,
      ts: Date.now(),
      payload: this.payload,
    };
  }
}
