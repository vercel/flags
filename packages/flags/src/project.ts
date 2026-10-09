import type { EvaluationContext, Provider, ReadonlyHeaders } from './types';

/**
 * The project fields each supported provider expects.
 */
export interface ProjectFieldsByProvider {
  'in-memory': Record<never, never>;
  launchdarkly: { projectId: string; teamId: string };
}

export type ProviderName = keyof ProjectFieldsByProvider;

export type ProjectMetadata<N extends ProviderName = ProviderName> = {
  [K in N]: { provider: K } & ProjectFieldsByProvider[K];
}[N];

export type GetEvaluationContext = (request: {
  headers: ReadonlyHeaders;
}) => EvaluationContext | Promise<EvaluationContext>;

export type ProjectOptions<N extends ProviderName = ProviderName> = {
  provider: N;
  /**
   * Called once per request to create the evaluation context.
   */
  getEvaluationContext?: GetEvaluationContext;
} & ProjectFieldsByProvider[N];

export type ProjectProvider<
  P extends Provider = Provider,
  N extends ProviderName = ProviderName,
> = P & { readonly metadata: P['metadata'] & ProjectMetadata<N> };

interface Project {
  getEvaluationContext?: GetEvaluationContext;
}

const projects = new WeakMap<Provider, Project>();

/**
 * Adds project metadata to a provider and returns the same provider instance.
 */
export function defineProject<P extends Provider, N extends ProviderName>(
  provider: P,
  options: ProjectOptions<N>,
): ProjectProvider<P, N> {
  const { getEvaluationContext, ...metadata } = options;
  const error = new Error(
    `flags: Could not add project metadata to provider "${provider.metadata.name}". The provider's metadata must be a mutable object.`,
  );

  try {
    Object.assign(provider.metadata, metadata);
  } catch (cause) {
    error.cause = cause;
    throw error;
  }

  // Catches providers whose metadata getter returns a new object on every access
  const assigned = provider.metadata as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(metadata)) {
    if (assigned[key] !== value) throw error;
  }

  projects.set(provider, { getEvaluationContext });

  return provider as ProjectProvider<P, N>;
}

/**
 * Returns whether the provider was passed to `defineProject`.
 *
 * @internal
 */
export function isProject(provider: Provider): provider is ProjectProvider {
  return projects.has(provider);
}

/**
 * Returns the `getEvaluationContext` function passed to `defineProject`.
 *
 * @internal
 */
export function getEvaluationContextGetter(
  provider: Provider,
): GetEvaluationContext | undefined {
  return projects.get(provider)?.getEvaluationContext;
}
