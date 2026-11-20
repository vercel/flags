import { runtime } from './runtime';
import { isSource, type Source, type SourceInput } from './source';
import type { TrackingEventDetails } from './types';

export interface TrackOptions<In> {
  /**
   * The first input of the chain which creates the evaluation context. It
   * goes to `getEvaluationContext` of the source.
   */
  evaluationContext: In;
  /**
   * Data of the event, e.g. `{ value: 99 }` for the amount of a purchase.
   */
  details?: TrackingEventDetails;
}

/**
 * The arguments after the event name. The options are optional if the
 * source accepts `undefined` as its evaluation context.
 */
export type TrackArgs<In> = undefined extends In
  ? [options?: Partial<TrackOptions<In>>]
  : [options: TrackOptions<In>];

/**
 * Records a tracking event with the provider of a source, e.g. a purchase
 * for an experiment. The provider gets the evaluation context of the
 * source, as for a flag.
 *
 * Waits for the initialization of the provider. A provider without `track`
 * ignores the event. Errors are logged, not thrown.
 *
 * @example
 * ```ts
 * await track(launchdarkly, 'purchase', { details: { value: 99 } });
 * ```
 */
export function track<C extends Source>(
  source: C,
  eventName: string,
  ...args: TrackArgs<SourceInput<C>>
): Promise<void>;
export function track(...args: unknown[]): Promise<void> {
  const [first, ...rest] = args;
  if (!isSource(first)) {
    throw new Error('flags: track expects a source and an event name.');
  }
  if (typeof rest[0] !== 'string') {
    throw new TypeError(
      'flags: The name of a tracking event must be a string.',
    );
  }
  return runtime.track(first, rest[0], rest[1] as never);
}
