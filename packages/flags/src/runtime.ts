import { AsyncLocalStorage } from 'node:async_hooks';
import { type Connection, isConnection } from './connection';
import { FlagEvaluationError, toEvaluationError } from './errors';
import { toHeaders } from './headers';
import { logger } from './logger';
import type {
  EvaluationContext,
  IncomingRequest,
  Provider,
  RequestLike,
} from './types';

/**
 * What the runtime needs to evaluate a flag. A flag returned by `defineFlag`
 * is a `FlagDefinition`.
 */
export interface FlagDefinition {
  readonly key: string;
  /**
   * Returned when the evaluation fails, after logging the error. If not set,
   * the error is thrown.
   */
  readonly defaultValue?: boolean;
  /**
   * A connection returned by `defineConnection`.
   */
  readonly connection: Connection;
}

/**
 * The state of one request. Each connection creates its evaluation context
 * once per request.
 */
class RequestScope {
  readonly #request: RequestLike;
  #incomingRequest: IncomingRequest | undefined;
  readonly #contexts = new Map<Connection, Promise<EvaluationContext>>();

  constructor(request: RequestLike) {
    this.#request = request;
  }

  evaluationContext(connection: Connection): Promise<EvaluationContext> {
    const existing = this.#contexts.get(connection);
    if (existing) return existing;

    const { getEvaluationContext } = connection;
    const context = new Promise<EvaluationContext>((resolve) =>
      resolve(
        getEvaluationContext ? getEvaluationContext(this.#incoming()) : {},
      ),
    );
    this.#contexts.set(connection, context);
    return context;
  }

  // Converts the headers only when a connection needs them
  #incoming(): IncomingRequest {
    this.#incomingRequest ??= { headers: toHeaders(this.#request.headers) };
    return this.#incomingRequest;
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
   * Call for each request. Pass the request of your framework, and the
   * function which continues to handle the request, e.g. `next` of a
   * middleware. Returns the result of `next`.
   *
   * Flags which are evaluated while `next` runs belong to this request: each
   * connection creates its evaluation context once per request.
   *
   * Starts the initialization of providers which are not initialized yet,
   * and retries failed initializations. Does not wait for them: each flag
   * waits only for the provider of its own connection. The evaluation of a
   * flag reports errors.
   *
   * @param request - A Web `Request`, a Node.js `IncomingMessage`, or any
   * object with headers.
   *
   * @example
   * ```ts
   * // Hono
   * app.use((c, next) => runtime.onInvoke(c.req.raw, next));
   * ```
   */
  onInvoke<T>(request: RequestLike, next: () => T | Promise<T>): Promise<T> {
    for (const provider of this.#registeredProviders()) {
      // Flags report the error, so it is ignored here
      this.initializeProvider(provider).catch(() => {});
    }
    return this.#storage.run(new RequestScope(request), async () => next());
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
   * Evaluates a flag. Inside `onInvoke`, uses the evaluation context of the
   * current request. Outside, uses an empty context.
   *
   * Calling a flag returned by `defineFlag` does the same. Use this method
   * to evaluate a key which is only known at runtime.
   *
   * Returns `defaultValue` if the evaluation fails, after logging the error.
   * Without `defaultValue`, rejects with a `FlagEvaluationError`.
   *
   * @example
   * ```ts
   * await runtime.evaluate(myFlag);
   * await runtime.evaluate({ key: 'new-checkout', connection, defaultValue: false });
   * ```
   */
  async evaluate(flag: FlagDefinition): Promise<boolean> {
    const { key, defaultValue, connection } = flag;
    if (!isConnection(connection)) {
      throw new Error(
        `flags: The connection of flag "${key}" must be returned by defineConnection.`,
      );
    }
    const { provider } = connection;

    try {
      const scope = this.#storage.getStore();
      const [, context] = await Promise.all([
        this.initializeProvider(provider),
        scope ? scope.evaluationContext(connection) : {},
      ]);

      const details = await provider.resolveBooleanEvaluation(
        key,
        // OpenFeature requires a default. Without one, errors are thrown, so
        // this placeholder is never returned.
        defaultValue ?? false,
        context,
        logger,
      );

      if (details.errorCode) {
        throw new FlagEvaluationError(
          key,
          details.errorCode,
          details.errorMessage ?? details.errorCode,
        );
      }
      if (typeof details.value !== 'boolean') {
        throw new FlagEvaluationError(
          key,
          'TYPE_MISMATCH',
          `Expected a boolean, got ${typeof details.value}`,
        );
      }
      return details.value;
    } catch (error) {
      const evaluationError = toEvaluationError(key, error);
      if (defaultValue === undefined) throw evaluationError;
      logger.error(evaluationError);
      return defaultValue;
    }
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
