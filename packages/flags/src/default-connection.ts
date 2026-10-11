import { createDefaultProvider } from 'flags/default-provider';
import {
  type Connection,
  type DefaultConnectionInput,
  defineConnection,
} from './connection';
import { sharedState } from './shared-state';
import type { EvaluationContext, Provider } from './types';

/**
 * The built-in connection of flags without a connection. It uses Vercel
 * Flags through the provider of `flags/default-provider`.
 */
export type DefaultConnection = Connection<
  Provider,
  'vercel-flags',
  EvaluationContext,
  DefaultConnectionInput
>;

/**
 * Returns the built-in default connection. All copies of the package share
 * it. The application can replace it with `defaultConnection` in its
 * configuration.
 *
 * @internal
 */
export function getBuiltInConnection(): DefaultConnection {
  sharedState.defaultConnection ??= defineConnection({
    provider: createDefaultProvider(),
    project: { system: 'vercel-flags' },
  });
  return sharedState.defaultConnection as DefaultConnection;
}
