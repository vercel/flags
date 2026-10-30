/** The build-time catalog contract used by this prototype. */
export interface Catalog {
  /** Identifies the provider project and environment. */
  id: string;
  revision?: number;
  flags: Record<string, { variants: readonly unknown[]; description?: string }>;
}

export interface Provider<Context> {
  evaluate(
    key: string,
    context: Context,
  ): Promise<{ value: unknown; catalogId: string }>;
}

export interface CatalogLoadOptions {
  /** Stop network requests and subscriptions when this signal is aborted. */
  signal: AbortSignal;
}

/** Yield a complete snapshot initially, then again whenever the catalog changes. */
export type CatalogLoader = (
  options: CatalogLoadOptions,
) =>
  | Catalog
  | AsyncIterable<Catalog>
  | Promise<Catalog | AsyncIterable<Catalog>>;

/** Framework adapters supply this read-only request view. */
export interface RequestInputs {
  /** Case-insensitive lookup; a missing header returns null. */
  headers: Pick<Headers, 'get'>;
  /** A missing cookie returns undefined. */
  cookies: { get(name: string): { value: string } | undefined };
}

export interface Connection<Context> {
  provider: Provider<Context>;
  getEvaluationContext(inputs: RequestInputs): Context | Promise<Context>;
}

export function defineConnection<Context>(options: {
  provider: Provider<Context>;
  getEvaluationContext: Connection<NoInfer<Context>>['getEvaluationContext'];
}): Connection<Context> {
  return options;
}
