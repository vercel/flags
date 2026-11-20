import { sharedState } from './shared-state';
import { defineSource, type Source } from './source';
import type { EvaluationContext, Provider, ResolutionDetails } from './types';

/**
 * The internal source of all inline flags. Its provider only exists so that
 * inline flags go through the same steps as the flags of a provider:
 * overrides, hooks, the cache of the request, and the checks of the value.
 * The runtime calls `decide` of the flag instead of the provider. It has no
 * project, so the flags manifest names no source for inline flags.
 */
export type DecideSource = Source<
  Provider,
  'in-memory',
  EvaluationContext,
  unknown
>;

function notCalled(): Promise<ResolutionDetails<never>> {
  return Promise.reject(
    new Error('flags: The provider of inline flags is never called.'),
  );
}

/**
 * Returns the source of inline flags. All copies of the package share it.
 *
 * @internal
 */
export function getDecideSource(): DecideSource {
  sharedState.decideSource ??= defineSource({
    provider: {
      metadata: { name: 'decide' },
      resolveBooleanEvaluation: notCalled,
      resolveStringEvaluation: notCalled,
      resolveNumberEvaluation: notCalled,
      resolveObjectEvaluation: notCalled,
    },
  });
  return sharedState.decideSource as DecideSource;
}
