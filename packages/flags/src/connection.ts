import type { EvaluationContext, IncomingRequest, Provider } from './types';

/**
 * The project fields each supported platform expects.
 */
export interface ProjectFieldsByPlatform {
  'in-memory': Record<never, never>;
  launchdarkly: { projectId: string; teamId: string };
}

export type Platform = keyof ProjectFieldsByPlatform;

/**
 * The project on a platform a connection points to.
 */
export type Project<N extends Platform = Platform> = {
  [K in N]: { platform: K } & ProjectFieldsByPlatform[K];
}[N];

export type GetEvaluationContext = (
  request: IncomingRequest,
) => EvaluationContext | Promise<EvaluationContext>;

export interface ConnectionOptions<P extends Provider, N extends Platform> {
  /**
   * The OpenFeature provider used to evaluate flags.
   */
  provider: P;
  project: { platform: N } & ProjectFieldsByPlatform[N];
  /**
   * Creates the evaluation context for a request. Called once per request,
   * on the first evaluation of a flag of this connection. Outside of a
   * request, flags are evaluated with an empty context.
   */
  getEvaluationContext?: GetEvaluationContext;
}

/**
 * Connects flags to a project on a platform, and to the provider which
 * evaluates them.
 */
export interface Connection<
  P extends Provider = Provider,
  N extends Platform = Platform,
> {
  readonly provider: P;
  readonly project: Project<N>;
  readonly getEvaluationContext?: GetEvaluationContext;
}

const connections = new WeakSet<object>();

/**
 * Defines a connection to a project on a platform.
 */
export function defineConnection<P extends Provider, N extends Platform>(
  options: ConnectionOptions<P, N>,
): Connection<P, N> {
  const connection: Connection<P, N> = Object.freeze({
    provider: options.provider,
    project: Object.freeze({ ...options.project }) as unknown as Project<N>,
    getEvaluationContext: options.getEvaluationContext,
  });
  connections.add(connection);
  return connection;
}

/**
 * Returns whether the value was returned by `defineConnection`.
 *
 * @internal
 */
export function isConnection(value: unknown): value is Connection {
  return typeof value === 'object' && value !== null && connections.has(value);
}
