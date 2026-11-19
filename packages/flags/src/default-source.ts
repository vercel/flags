import { createDefaultProvider } from 'flags/default-provider';
import { sharedState } from './shared-state';
import { type DefaultSourceInput, defineSource, type Source } from './source';
import type { EvaluationContext, Provider } from './types';

/**
 * The built-in source of flags without a source. It uses Vercel
 * Flags through the provider of `flags/default-provider`.
 */
export type DefaultSource = Source<
  Provider,
  'vercel-flags',
  EvaluationContext,
  DefaultSourceInput
>;

/**
 * Returns the built-in default source. All copies of the package share
 * it. The application can replace it with `defaultSource` in its
 * configuration.
 *
 * @internal
 */
export function getBuiltInSource(): DefaultSource {
  sharedState.defaultSource ??= defineSource({
    provider: createDefaultProvider(),
    project: { system: 'vercel-flags' },
  });
  return sharedState.defaultSource as DefaultSource;
}
