/** The small provider contract used by this prototype. */
export interface Catalog {
  /** Identifies the provider project and environment. */
  id: string;
  revision?: number;
  flags: Record<string, { variants: readonly unknown[] }>;
}

export interface Provider<Context> {
  loadCatalog(): Promise<Catalog>;
  evaluate(
    key: string,
    context: Context,
  ): Promise<{ value: unknown; catalogId: string }>;
}

export interface RequestInputs {
  headers: Pick<Headers, 'get'>;
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
