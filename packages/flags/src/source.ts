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
   * Vercel Flags. Without fields, it uses the platform project of Vercel as
   * its flag project, so the fields come from the environment. Set
   * `projectId`, and `teamId` for a project of a different team, to use the
   * flags of a different project.
   */
  'vercel-flags': { projectId?: string; teamId?: string };
  /**
   * `projectId` is the key of the project in LaunchDarkly. The link to a
   * flag needs `environment`, the key of the environment. The links do not
   * use `teamId`.
   */
  launchdarkly: { projectId: string; teamId?: string; environment?: string };
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
 * The flag project in a system which a source points to.
 */
export type Project<N extends FlagManagementSystem = FlagManagementSystem> = {
  [K in N]: { system: K } & CommonProjectFields & ProjectFieldsBySystem[K];
}[N];

/**
 * A step in the chain which creates the evaluation context. It receives the
 * current request and the context of the step before. `request` is
 * `undefined` outside of `runtime.onInvoke`.
 *
 * The chain runs from the call side, through the flag, to the source.
 * The result of the source goes to the provider.
 */
export type GetEvaluationContext<In = unknown, Out = EvaluationContext> = (
  request: FlagsRequest | undefined,
  context: In,
) => Out | Promise<Out>;

/**
 * The context which a source accepts from its flags. Without
 * `getEvaluationContext`, the source gives it to the provider as it is.
 */
export type DefaultSourceInput = EvaluationContext | undefined;

export interface SourceOptions<
  P extends Provider,
  N extends FlagManagementSystem,
  C extends EvaluationContext = EvaluationContext,
  In = DefaultSourceInput,
> {
  /**
   * The OpenFeature provider used to evaluate flags.
   */
  provider: P;
  /**
   * The flag project in the flag management system, e.g. for the links of
   * Flags Explorer to the dashboard. Optional: without it, the flags work
   * the same, but the manifest names no source for them.
   */
  project?: { system: N } & CommonProjectFields & ProjectFieldsBySystem[N];
  /**
   * OpenFeature hooks for the flags of this source. They run after the
   * hooks of the configuration, and before the hooks of the call side and of
   * the provider. They also run for overrides.
   */
  hooks?: readonly Hook[];
  /**
   * The last step of the chain. Receives the current request and the
   * context which the flag creates, and returns the context for the
   * provider. The type of `context` defines
   * what the flags of this source must give. The return type defines
   * what the provider receives.
   *
   * Runs once per request for each input. Plain data is compared by its
   * content, other objects by identity. Outside of a request, it
   * runs on each evaluation, and `request` is `undefined`.
   *
   * @example
   * ```ts
   * getEvaluationContext: async (request, context: { teamId: string }) => ({
   *   team: await loadTeam(context.teamId),
   *   user: request?.headers.get('x-user') ?? null,
   * }),
   * ```
   */
  getEvaluationContext?(
    request: FlagsRequest | undefined,
    context: In,
  ): C | Promise<C>;
}

/**
 * Connects flags to a flag project in a system, and to the provider which
 * evaluates them.
 *
 * `C` is the context which the provider receives. `In` is the context which
 * the flags of this source must give.
 */
export interface Source<
  P extends Provider = Provider,
  N extends FlagManagementSystem = FlagManagementSystem,
  C extends EvaluationContext = EvaluationContext,
  In = DefaultSourceInput,
> {
  readonly provider: P;
  readonly project?: Project<N>;
  readonly hooks?: readonly Hook[];
  getEvaluationContext?(
    request: FlagsRequest | undefined,
    context: In,
  ): C | Promise<C>;
}

/**
 * The context which the flags of a source must give.
 */
export type SourceInput<C extends Source> =
  C extends Source<Provider, FlagManagementSystem, EvaluationContext, infer In>
    ? In
    : never;

const { sources } = sharedState;

/**
 * Defines a source to a flag project in a system.
 */
export function defineSource<
  P extends Provider,
  N extends FlagManagementSystem,
  C extends EvaluationContext = EvaluationContext,
  In = DefaultSourceInput,
>(options: SourceOptions<P, N, C, In>): Source<P, N, C, In> {
  const { project } = options;
  if (project !== undefined) {
    if (Object.hasOwn(project, 'platform')) {
      throw new TypeError(
        'flags: Use `system` instead of `platform` for the flag management system of a project.',
      );
    }
    const { systemManifest } = project as CommonProjectFields;
    if (systemManifest !== undefined && !isSafeUrl(systemManifest)) {
      throw new TypeError(
        'flags: The systemManifest of a project must be an HTTPS URL.',
      );
    }
  }
  const source: Source<P, N, C, In> = Object.freeze({
    provider: options.provider,
    project:
      project === undefined
        ? undefined
        : (Object.freeze({ ...project }) as unknown as Project<N>),
    getEvaluationContext: options.getEvaluationContext,
    hooks: options.hooks ? Object.freeze([...options.hooks]) : undefined,
  });
  sources.add(source);
  return source;
}

/**
 * Returns whether the value was returned by `defineSource`.
 *
 * @internal
 */
export function isSource(value: unknown): value is Source {
  return typeof value === 'object' && value !== null && sources.has(value);
}
