import { sharedState } from './shared-state';
import { isSafeUrl } from './system-manifest';
import type { EvaluationContext, FlagsRequest, Hook, Provider } from './types';

/**
 * The fields of the flag project which each supported flag management
 * system (system) expects.
 */
export interface ProjectFieldsBySystem {
  'in-memory': Record<never, never>;
  /**
   * Vercel Flags. It uses the platform project of Vercel as its flag
   * project, so the fields come from the environment.
   */
  'vercel-flags': Record<never, never>;
  /**
   * `projectId` is the key of the project in LaunchDarkly. The link to a
   * flag needs `environment`, the key of the environment.
   */
  launchdarkly: { projectId: string; teamId: string; environment?: string };
}

/**
 * A flag management system (OpenFeature): the source of truth of the flags,
 * e.g. LaunchDarkly or Vercel Flags. The short form is "system".
 */
export type FlagManagementSystem = keyof ProjectFieldsBySystem;

const SYSTEM_MANIFESTS = 'https://flags-sdk.dev/system-manifests';

/**
 * The URL of the system manifest of each system (see `system-manifest.ts`).
 * A tool builds the links to the dashboard of the system from it. A system
 * adds itself with a pull request, and, until it publishes its own file,
 * the SDK hosts it.
 *
 * @internal
 */
export const systemManifestUrls: Readonly<
  Record<FlagManagementSystem, string | undefined>
> = {
  'in-memory': undefined,
  'vercel-flags': `${SYSTEM_MANIFESTS}/vercel-flags.json`,
  launchdarkly: `${SYSTEM_MANIFESTS}/launchdarkly.json`,
};

/**
 * Fields which each project can have.
 */
interface CommonProjectFields {
  /**
   * The URL of the system manifest, instead of the one of the system.
   */
  systemManifest?: string;
}

/**
 * The flag project in a system which a connection points to.
 */
export type Project<N extends FlagManagementSystem = FlagManagementSystem> = {
  [K in N]: { system: K } & CommonProjectFields & ProjectFieldsBySystem[K];
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
  N extends FlagManagementSystem,
  C extends EvaluationContext = EvaluationContext,
  In = DefaultConnectionInput,
> {
  /**
   * The OpenFeature provider used to evaluate flags.
   */
  provider: P;
  project: { system: N } & CommonProjectFields & ProjectFieldsBySystem[N];
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
 * Connects flags to a flag project in a system, and to the provider which
 * evaluates them.
 *
 * `C` is the context which the provider receives. `In` is the context which
 * the flags of this connection must give.
 */
export interface Connection<
  P extends Provider = Provider,
  N extends FlagManagementSystem = FlagManagementSystem,
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
  C extends Connection<
    Provider,
    FlagManagementSystem,
    EvaluationContext,
    infer In
  >
    ? In
    : never;

const { connections } = sharedState;

/**
 * Defines a connection to a flag project in a system.
 */
export function defineConnection<
  P extends Provider,
  N extends FlagManagementSystem,
  C extends EvaluationContext = EvaluationContext,
  In = DefaultConnectionInput,
>(options: ConnectionOptions<P, N, C, In>): Connection<P, N, C, In> {
  if (Object.hasOwn(options.project, 'platform')) {
    throw new TypeError(
      'flags: Use `system` instead of `platform` for the flag management system of a project.',
    );
  }
  const { systemManifest } = options.project as CommonProjectFields;
  if (systemManifest !== undefined && !isSafeUrl(systemManifest)) {
    throw new TypeError(
      'flags: The systemManifest of a project must be an HTTPS URL.',
    );
  }
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
