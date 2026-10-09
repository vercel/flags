import { AsyncLocalStorage } from 'node:async_hooks';
import type { Connection } from './connection';
import { logger } from './logger';
import {
  type EvaluationContext,
  type IncomingRequest,
  type Provider,
  providerExtension,
} from './types';

/**
 * The state of one request. Each provider is prepared once, and each
 * connection creates its evaluation context once.
 */
class RequestScope {
  readonly #request: IncomingRequest;
  readonly #runtime: RuntimeImpl;
  readonly #preparations = new Map<Provider, Promise<void>>();
  readonly #contexts = new Map<Connection, Promise<EvaluationContext>>();

  constructor(request: IncomingRequest, runtime: RuntimeImpl) {
    this.#request = request;
    this.#runtime = runtime;
  }

  /**
   * Initializes the provider, then calls its `onInvoke` extension. Rejects
   * only if the initialization fails.
   */
  prepare(provider: Provider): Promise<void> {
    const existing = this.#preparations.get(provider);
    if (existing) return existing;

    const preparation = this.#runtime
      .initializeProvider(provider)
      .then(async () => {
        try {
          await provider[providerExtension]?.onInvoke?.(this.#request);
        } catch (error) {
          logger.error(
            `flags: The onInvoke extension of provider "${provider.metadata.name}" failed.`,
            error,
          );
        }
      });
    this.#preparations.set(provider, preparation);
    return preparation;
  }

  evaluationContext(connection: Connection): Promise<EvaluationContext> {
    const existing = this.#contexts.get(connection);
    if (existing) return existing;

    const { getEvaluationContext } = connection;
    const context = new Promise<EvaluationContext>((resolve) =>
      resolve(getEvaluationContext ? getEvaluationContext(this.#request) : {}),
    );
    this.#contexts.set(connection, context);
    return context;
  }
}

/**
 * Coordinates the providers of all connections. Use the default `runtime`
 * instance. An application has only one runtime.
 *
 * The lifecycle methods map to the AWS Lambda phases. Framework integrations
 * call them.
 */
class RuntimeImpl {
  readonly #connections = new Set<Connection>();
  readonly #initializations = new Map<Provider, Promise<void>>();
  readonly #storage = new AsyncLocalStorage<RequestScope>();

  /**
   * Call once before the first request, e.g. in the Lambda init phase.
   *
   * Initializes the providers of all registered connections and waits for
   * them. Errors are logged, not thrown. A failed provider is initialized
   * again on the next request or evaluation.
   */
  async onInit(): Promise<void> {
    const providers = this.#registeredProviders();
    const results = await Promise.allSettled(
      providers.map((provider) => this.initializeProvider(provider)),
    );
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') return;
      logger.error(
        `flags: Could not initialize provider "${providers[index]?.metadata.name}".`,
        result.reason,
      );
    });
  }

  /**
   * Call for each request, inside the request handler. Pass the code which
   * handles the request as `handler`, and return its result.
   *
   * Flags which are evaluated inside `handler` belong to this request: each
   * connection creates its evaluation context once per request.
   *
   * Starts the initialization of providers which are not initialized yet,
   * retries failed initializations, and starts the `onInvoke` extension of
   * each provider. Does not wait for this work: each flag waits only for the
   * provider of its own connection. The evaluation of a flag reports errors.
   *
   * @example
   * ```ts
   * return runtime.onInvoke({ headers: request.headers }, () =>
   *   handler(request),
   * );
   * ```
   */
  onInvoke<T>(
    request: IncomingRequest,
    handler: () => T | Promise<T>,
  ): Promise<T> {
    const scope = new RequestScope(request, this);
    return this.#storage.run(scope, async () => {
      for (const provider of this.#registeredProviders()) {
        // Flags report the error, so it is ignored here
        scope.prepare(provider).catch(() => {});
      }
      return handler();
    });
  }

  /**
   * Call once when the process shuts down.
   *
   * Waits for running initializations, then closes every provider which was
   * initialized. Errors are logged, not thrown. After a shutdown, the next
   * use initializes the providers again.
   */
  async onShutdown(): Promise<void> {
    const pending = [...this.#initializations];
    this.#initializations.clear();

    await Promise.all(
      pending.map(async ([provider, initialization]) => {
        try {
          await initialization;
        } catch {
          // The provider was never initialized, so there is nothing to close
          return;
        }
        try {
          await provider.onClose?.();
        } catch (error) {
          logger.error(
            `flags: Could not close provider "${provider.metadata.name}".`,
            error,
          );
        }
      }),
    );
  }

  /**
   * Waits until all running initializations are finished. Does not throw if
   * an initialization fails, because the evaluation of a flag reports it.
   */
  async waitForInitialization(): Promise<void> {
    await Promise.allSettled(this.#initializations.values());
  }

  /**
   * Makes a connection known to the runtime.
   *
   * @internal
   */
  registerConnection(connection: Connection): void {
    this.#connections.add(connection);
  }

  /**
   * @internal
   */
  get connections(): ReadonlySet<Connection> {
    return this.#connections;
  }

  /**
   * Initializes a provider once. Concurrent callers share the same
   * initialization. A failed initialization is retried on the next call.
   *
   * @internal
   */
  initializeProvider(provider: Provider): Promise<void> {
    const existing = this.#initializations.get(provider);
    if (existing) return existing;

    let started: Promise<void>;
    try {
      // Call synchronously, so the work starts immediately
      started = Promise.resolve(provider.initialize?.());
    } catch (error) {
      started = Promise.reject(error);
    }

    const initialization: Promise<void> = started.catch((error: unknown) => {
      // Only forget this attempt, not a newer one started after a shutdown
      if (this.#initializations.get(provider) === initialization) {
        this.#initializations.delete(provider);
      }
      throw error;
    });
    this.#initializations.set(provider, initialization);
    return initialization;
  }

  /**
   * Returns the scope of the current request, if there is one.
   *
   * @internal
   */
  get requestScope(): RequestScope | undefined {
    return this.#storage.getStore();
  }

  /**
   * Removes all connections and initializations. Only for tests.
   *
   * @internal
   */
  reset(): void {
    this.#connections.clear();
    this.#initializations.clear();
  }

  #registeredProviders(): Provider[] {
    return [...new Set([...this.#connections].map((c) => c.provider))];
  }
}

/**
 * The type of the `runtime`. Only a type, so an application can not create a
 * second runtime.
 */
export type Runtime = RuntimeImpl;

/**
 * The runtime of the application.
 */
export const runtime: Runtime = new RuntimeImpl();
