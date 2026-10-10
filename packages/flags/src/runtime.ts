import { AsyncLocalStorage } from 'node:async_hooks';
import type { Config } from './config';
import { type Connection, isConnection } from './connection';
import { getBuiltInConnection } from './default-connection';
import { FlagEvaluationError, toEvaluationError } from './errors';
import type { Evaluate } from './evaluate';
import { logger } from './logger';
import {
  createOverridesReader,
  type OverridesReader,
} from './overrides/reader';
import type { JsonValue } from './overrides/types';
import { createFlagsRequest } from './request';
import { sharedState } from './shared-state';
import type {
  EvaluationContext,
  FlagsRequest,
  FlagsRequestInit,
  Provider,
} from './types';

/**
 * What the runtime needs to evaluate a flag. A flag returned by `defineFlag`
 * is a `FlagDefinition`.
 */
export interface FlagDefinition {
  readonly key: string;
  /**
   * The middle step of the chain which creates the evaluation context. See
   * `defineFlag`.
   */
  getEvaluationContext?(
    context: unknown,
    request: FlagsRequest | undefined,
  ): unknown;
  /**
   * Returned when the evaluation fails, after logging the error. If not set,
   * the error is thrown.
   */
  readonly defaultValue?: boolean;
  /**
   * A connection returned by `defineConnection`. Without it, the flag uses
   * the default connection.
   */
  readonly connection?: Connection;
}

/**
 * Returns the current request, or `undefined` outside of a request. See
 * `runtime.setRequestSource`.
 */
export type RequestSource = () =>
  | FlagsRequestInit
  | undefined
  | Promise<FlagsRequestInit | undefined>;

type Step = (context: unknown, request: FlagsRequest | undefined) => unknown;

/**
 * The state of one request. Each step of the context chain runs once per
 * input object.
 */
class RequestScope {
  readonly request: FlagsRequest;
  readonly #results = new Map<
    Step,
    {
      objects: WeakMap<object, Promise<unknown>>;
      values: Map<unknown, Promise<unknown>>;
    }
  >();

  #overrides: Promise<ReadonlyMap<string, JsonValue>> | undefined;

  constructor(request: FlagsRequest) {
    this.request = request;
  }

  /**
   * Reads the overrides of the request once.
   */
  overrides(read: OverridesReader): Promise<ReadonlyMap<string, JsonValue>> {
    this.#overrides ??= read(this.request.cookies);
    return this.#overrides;
  }

  run(step: Step, owner: object, input: unknown): Promise<unknown> {
    let results = this.#results.get(step);
    if (!results) {
      results = { objects: new WeakMap(), values: new Map() };
      this.#results.set(step, results);
    }
    const isObject = typeof input === 'object' && input !== null;
    const existing = isObject
      ? results.objects.get(input)
      : results.values.get(input);
    if (existing) return existing;

    const result = callStep(step, owner, input, this.request);
    if (isObject) results.objects.set(input, result);
    else results.values.set(input, result);
    return result;
  }
}

function callStep(
  step: Step,
  owner: object,
  input: unknown,
  request: FlagsRequest | undefined,
): Promise<unknown> {
  return new Promise((resolve) => resolve(step.call(owner, input, request)));
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
  #requestSource: RequestSource | undefined;
  #readOverrides: OverridesReader = createOverridesReader();
  #config: Config = {};
  // Whether a flag uses the default connection. Only then does the runtime
  // initialize its provider.
  #usesDefaultConnection = false;
  readonly #sourceScopes = new WeakMap<object, RequestScope>();

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
   * @param request - What the framework can give about the request, e.g. a
   * Web `Request`. Each step of the evaluation context chain receives it as
   * a standard `FlagsRequest`.
   *
   * @example
   * ```ts
   * // Hono
   * app.use((c, next) => runtime.onInvoke(c.req.raw, next));
   * ```
   */
  onInvoke<T>(
    request: FlagsRequestInit,
    next: () => T | Promise<T>,
  ): Promise<T> {
    for (const provider of this.#registeredProviders()) {
      // Flags report the error, so it is ignored here
      this.initializeProvider(provider).catch(() => {});
    }
    return this.#storage.run(
      new RequestScope(createFlagsRequest(request)),
      async () => next(),
    );
  }

  /**
   * Sets a function which returns the current request. Use it for frameworks
   * which can give the current request at any time, but have no middleware
   * which wraps the handler, e.g. Next.js with `headers()` and `cookies()`.
   *
   * The SDK identifies a request by its `headers` object. Thus, the function
   * can return a new object on each call, but its `headers` must be the same
   * object during one request. Without `headers`, the function must return
   * the same object during one request. The function
   * returns `undefined` outside of a request. Inside `onInvoke`, the request
   * of `onInvoke` is used, and the function is not called.
   *
   * @example
   * ```ts
   * // Next.js: headers() returns the same object during one request
   * runtime.setRequestSource(async () => ({
   *   headers: await headers(),
   *   cookies: await cookies(),
   * }));
   * ```
   */
  setRequestSource(source: RequestSource | undefined): void {
    this.#requestSource = source;
  }

  /**
   * Configures the SDK. By convention, the framework integration calls it
   * with the export `config` of `flags.config.ts`. Without a framework, call
   * it at startup.
   *
   * A new call replaces the configuration, e.g. after a reload in
   * development. Validates the configuration at once, and throws before it
   * changes anything.
   *
   * @example
   * ```ts
   * import { config } from './flags.config';
   *
   * runtime.configure(config);
   * ```
   */
  configure(config: Config): void {
    const { defaultConnection } = config;
    if (defaultConnection !== undefined && !isConnection(defaultConnection)) {
      throw new Error(
        'flags: The defaultConnection of the configuration must be returned by defineConnection.',
      );
    }
    const readOverrides = createOverridesReader(config.overrides);

    this.#config = config;
    this.#readOverrides = readOverrides;
    if (defaultConnection) this.registerConnection(defaultConnection);
  }

  /**
   * The connection of flags without a connection: the `defaultConnection` of
   * the configuration, or the built-in default connection.
   *
   * @internal
   */
  get defaultConnection(): Connection {
    return this.#config.defaultConnection ?? getBuiltInConnection();
  }

  /**
   * Marks that a flag uses the default connection.
   *
   * @internal
   */
  useDefaultConnection(): void {
    this.#usesDefaultConnection = true;
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
   * Evaluates one flag or several flags. The same as the `evaluate` function
   * which the package exports.
   */
  readonly evaluate: Evaluate = ((
    flags: FlagDefinition | readonly FlagDefinition[],
    options?: { evaluationContext?: unknown },
  ) => {
    const input = options?.evaluationContext;
    return Array.isArray(flags)
      ? Promise.all(flags.map((flag) => this.#evaluateFlag(flag, input)))
      : this.#evaluateFlag(flags as FlagDefinition, input);
  }) as Evaluate;

  /**
   * Runs the chain: the call side gives `input` to the flag, the flag to the
   * connection, and the connection to the provider. A missing step gives its
   * input to the next step as it is.
   */
  async #evaluationContext(
    flag: FlagDefinition,
    connection: Connection,
    input: unknown,
    scope: RequestScope | undefined,
  ): Promise<EvaluationContext> {
    const run = (step: Step, owner: object, value: unknown) =>
      scope
        ? scope.run(step, owner, value)
        : callStep(step, owner, value, undefined);

    let context = input;
    if (flag.getEvaluationContext) {
      context = await run(flag.getEvaluationContext, flag, context);
    }
    if (connection.getEvaluationContext) {
      context = await run(
        connection.getEvaluationContext as Step,
        connection,
        context,
      );
    }
    return (context ?? {}) as EvaluationContext;
  }

  async #evaluateFlag(flag: FlagDefinition, input: unknown): Promise<boolean> {
    const { key, defaultValue } = flag;
    const connection = flag.connection ?? this.defaultConnection;
    if (!isConnection(connection)) {
      throw new Error(
        `flags: The connection of flag "${key}" must be returned by defineConnection.`,
      );
    }
    const { provider } = connection;

    try {
      const scope = this.#storage.getStore() ?? (await this.#scopeFromSource());

      // An override skips the provider, also its initialization
      const override = scope
        ? (await scope.overrides(this.#readOverrides)).get(key)
        : undefined;
      if (typeof override === 'boolean') return override;
      if (override !== undefined) {
        logger.warn(
          `flags: The override of flag "${key}" was ignored, because it is not a boolean.`,
        );
      }

      const [, context] = await Promise.all([
        this.initializeProvider(provider),
        this.#evaluationContext(flag, connection, input, scope),
      ]);

      const details = await provider.resolveBooleanEvaluation(
        key,
        // OpenFeature requires a default of the correct type, and providers
        // examine it. Without one, the SDK passes false (see the spec).
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
      // One line per evaluation, so a broken flag does not fill the logs
      logger.error(
        `${evaluationError.message.replace(/\.$/, '')}. Returned the default value: ${defaultValue}.`,
      );
      logger.debug(evaluationError);
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
    this.#requestSource = undefined;
    this.#readOverrides = createOverridesReader();
    this.#config = {};
    this.#usesDefaultConnection = false;
  }

  async #scopeFromSource(): Promise<RequestScope | undefined> {
    if (!this.#requestSource) return undefined;
    const init = await this.#requestSource();
    if (init === undefined) return undefined;
    // The headers stay the same object during one request, also when the
    // source returns a new object on each call, e.g. in Next.js
    const key = init.headers ?? init;
    let scope = this.#sourceScopes.get(key);
    if (!scope) {
      scope = new RequestScope(createFlagsRequest(init));
      this.#sourceScopes.set(key, scope);
    }
    return scope;
  }

  #registeredProviders(): Provider[] {
    const connections = [...this.#connections];
    if (this.#usesDefaultConnection) connections.push(this.defaultConnection);
    return [...new Set(connections.map((c) => c.provider))];
  }
}

/**
 * The type of the `runtime`. Only a type, so an application can not create a
 * second runtime.
 */
export type Runtime = RuntimeImpl;

/**
 * The runtime of the application. All copies of the package in one process
 * share it.
 */
sharedState.runtime ??= new RuntimeImpl();
export const runtime = sharedState.runtime as Runtime;
