import { sharedState } from './shared-state';
import type { EvaluationContext, FlagsRequest, Hook, Provider } from './types';

/**
 * The project fields each supported platform expects.
 */
export interface ProjectFieldsByPlatform {
  'in-memory': Record<never, never>;
  /**
   * Vercel Flags. The project of Vercel comes from the environment.
   */
  vercel: Record<never, never>;
  launchdarkly: { projectId: string; teamId: string };
}

export type Platform = keyof ProjectFieldsByPlatform;

/**
 * The project on a platform a connection points to.
 */
export type Project<N extends Platform = Platform> = {
  [K in N]: { platform: K } & ProjectFieldsByPlatform[K];
}[N];

/**
 * A step in the chain which creates the evaluation context. It receives the
 * context of the step before, and the current request. `request` is
 * `undefined` outside of `runtime.onInvoke`.
 *
 * The chain runs from the call side, through the flag, to the connection.
 * The result of the connection goes to the provider.
 */
export type GetEvaluationContext<In = unknown, Out = EvaluationContext> = (
  context: In,
  request: FlagsRequest | undefined,
) => Out | Promise<Out>;

/**
 * The context which a connection accepts from its flags. Without
 * `getEvaluationContext`, the connection gives it to the provider as it is.
 */
export type DefaultConnectionInput = EvaluationContext | undefined;

export interface ConnectionOptions<
  P extends Provider,
  N extends Platform,
  C extends EvaluationContext = EvaluationContext,
  In = DefaultConnectionInput,
> {
  /**
   * The OpenFeature provider used to evaluate flags.
   */
  provider: P;
  project: { platform: N } & ProjectFieldsByPlatform[N];
  /**
   * OpenFeature hooks for the flags of this connection. They run after the
   * hooks of the configuration, and before the hooks of the call side and of
   * the provider. They also run for overrides.
   */
  hooks?: readonly Hook[];
  /**
   * The last step of the chain. Receives the context which the flag creates,
   * and returns the context for the provider. The type of `context` defines
   * what the flags of this connection must give. The return type defines
   * what the provider receives.
   *
   * Runs once per request for each input. Plain data is compared by its
   * content, other objects by identity. Outside of a request, it
   * runs on each evaluation, and `request` is `undefined`.
   *
   * @example
   * ```ts
   * getEvaluationContext: async (context: { teamId: string }, request) => ({
   *   team: await loadTeam(context.teamId),
   *   user: request?.headers.get('x-user') ?? null,
   * }),
   * ```
   */
  getEvaluationContext?(
    context: In,
    request: FlagsRequest | undefined,
  ): C | Promise<C>;
}

/**
 * Connects flags to a project on a platform, and to the provider which
 * evaluates them.
 *
 * `C` is the context which the provider receives. `In` is the context which
 * the flags of this connection must give.
 */
export interface Connection<
  P extends Provider = Provider,
  N extends Platform = Platform,
  C extends EvaluationContext = EvaluationContext,
  In = DefaultConnectionInput,
> {
  readonly provider: P;
  readonly project: Project<N>;
  readonly hooks?: readonly Hook[];
  getEvaluationContext?(
    context: In,
    request: FlagsRequest | undefined,
  ): C | Promise<C>;
}

/**
 * The context which the flags of a connection must give.
 */
export type ConnectionInput<C extends Connection> =
  C extends Connection<Provider, Platform, EvaluationContext, infer In>
    ? In
    : never;

const { connections } = sharedState;

/**
 * Defines a connection to a project on a platform.
 */
export function defineConnection<
  P extends Provider,
  N extends Platform,
  C extends EvaluationContext = EvaluationContext,
  In = DefaultConnectionInput,
>(options: ConnectionOptions<P, N, C, In>): Connection<P, N, C, In> {
  const connection: Connection<P, N, C, In> = Object.freeze({
    provider: options.provider,
    project: Object.freeze({ ...options.project }) as unknown as Project<N>,
    getEvaluationContext: options.getEvaluationContext,
    hooks: options.hooks ? Object.freeze([...options.hooks]) : undefined,
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
