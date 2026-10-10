import { AsyncLocalStorage } from 'node:async_hooks';
import { setupIntegration } from 'flags/integration';
import type { Config } from './config';
import { type Connection, isConnection } from './connection';
import { getBuiltInConnection } from './default-connection';
import { FlagEvaluationError, toEvaluationError } from './errors';
import type { Evaluate } from './evaluate';
import { logger } from './logger';
import { codeDefault } from './ofrep';
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
  Logger,
  Provider,
  ResolutionDetails,
} from './types';
import {
  describeValue,
  type FlagOptionObject,
  type FlagType,
  type FlagValue,
  hasType,
  isOption,
  placeholderOf,
  resolveMethodOf,
} from './value-types';

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
  readonly defaultValue?: FlagValue;
  /**
   * The type of the value. The default is `boolean`.
   */
  readonly type?: FlagType;
  /**
   * The values which the flag can have, as objects with a value. A value
   * that is not one of them fails.
   */
  readonly options?: readonly FlagOptionObject<FlagValue>[];
  /**
   * A connection returned by `defineConnection`. Without it, the flag uses
   * the default connection.
   */
  readonly connection?: Connection;
}

/**
 * Why a value does not fit a flag, or `undefined` if it fits.
 */
function valueProblem(
  value: unknown,
  type: FlagType,
  options: readonly FlagOptionObject<FlagValue>[] | undefined,
): string | undefined {
  if (!hasType(value, type)) return `it is not a ${type}`;
  if (options && !isOption(value, options)) {
    return 'it is not one of the options';
  }
  return undefined;
}

function typeName(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function formatValue(value: FlagValue): string {
  return typeof value === 'object' || typeof value === 'string'
    ? JSON.stringify(value)
    : String(value);
}

/**
 * Returns the configuration, or `undefined` if there is none. See
 * `runtime.setConfigSource`.
 */
export type ConfigSource = () =>
  | Config
  | undefined
  | Promise<Config | undefined>;

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
  #integration: Promise<void> | undefined;
  #rethrow: ((error: unknown) => void) | undefined;
  #configSource: ConfigSource | undefined;
  #loadedConfig: Promise<void> | undefined;
  readonly #sourceScopes = new WeakMap<object, RequestScope>();

  /**
   * Call once before the first request, e.g. in the Lambda init phase.
   *
   * Initializes the providers of all registered connections and waits for
   * them. Errors are logged, not thrown. A failed provider is initialized
   * again on the next request or evaluation.
   */
  async onInit(): Promise<void> {
    try {
      await this.#setUpIntegration();
      await this.#loadConfig();
    } catch (error) {
      logger.error('flags: Could not set up the framework integration.', error);
    }
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
   * Sets a function which throws an error again if the framework must
   * receive it. Some frameworks use errors as signals, e.g. Next.js to stop
   * the static rendering, and the SDK must not catch them. The runtime calls
   * it first when an evaluation fails, before it uses the defaultValue.
   * The framework integration sets it.
   *
   * @example
   * ```ts
   * // Next.js
   * import { unstable_rethrow } from 'next/navigation';
   *
   * runtime.setRethrow(unstable_rethrow);
   * ```
   */
  setRethrow(rethrow: ((error: unknown) => void) | undefined): void {
    this.#rethrow = rethrow;
  }

  /**
   * Sets a function which returns the configuration, e.g. the export
   * `config` of `flags.config.ts`. The framework integration sets it.
   *
   * In production, the runtime calls it one time. In development, the
   * runtime calls it before each evaluation, and configures again when it
   * returns a different object, so that a change of `flags.config.ts`
   * applies without a restart.
   */
  setConfigSource(source: ConfigSource | undefined): void {
    this.#configSource = source;
    this.#loadedConfig = undefined;
  }

  /**
   * Configures the SDK. By convention, the framework integration calls it
   * with the export `config` of `flags.config.ts`. Without a framework, call
   * it at startup.
   *
   * A new call replaces the configuration, e.g. after a reload in
   * development. A replaced default connection is closed, if no other
   * connection uses its provider. Validates the configuration at once, and
   * throws before it changes anything.
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

    const previous = this.#config.defaultConnection;
    this.#config = config;
    this.#readOverrides = readOverrides;
    // A replaced default connection, e.g. after a reload in development,
    // must not keep its client open
    if (previous && previous !== defaultConnection) {
      this.#closeUnusedProvider(previous.provider);
    }
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
  markDefaultConnectionUsed(): void {
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

  async #evaluateFlag(
    flag: FlagDefinition,
    input: unknown,
  ): Promise<FlagValue> {
    const { key, defaultValue, options } = flag;
    const type = flag.type ?? 'boolean';
    // The integration can configure the default connection, so it must run
    // before the SDK selects the connection of the flag
    let setupError: unknown;
    try {
      await this.#setUpIntegration();
      await this.#loadConfig();
    } catch (error) {
      setupError = error;
    }
    const connection = flag.connection ?? this.defaultConnection;
    if (!isConnection(connection)) {
      throw new Error(
        `flags: The connection of flag "${key}" must be returned by defineConnection.`,
      );
    }
    const { provider } = connection;

    try {
      if (setupError !== undefined) throw setupError;
      const scope = this.#storage.getStore() ?? (await this.#scopeFromSource());

      // An override skips the provider, also its initialization
      const override = scope
        ? (await scope.overrides(this.#readOverrides)).get(key)
        : undefined;
      if (override !== undefined) {
        const problem = valueProblem(override, type, options);
        if (!problem) return override as FlagValue;
        logger.warn(
          `flags: The override of flag "${key}" was ignored, because ${problem}.`,
        );
      }

      const resolve = provider[resolveMethodOf[type]] as
        | ((
            flagKey: string,
            defaultValue: FlagValue,
            context: EvaluationContext,
            logger: Logger,
          ) => Promise<ResolutionDetails<unknown>>)
        | undefined;
      if (!resolve) {
        throw new FlagEvaluationError(
          key,
          'GENERAL',
          `The provider "${provider.metadata.name}" does not support ${type} flags.`,
        );
      }

      const [, context] = await Promise.all([
        this.initializeProvider(provider),
        this.#evaluationContext(flag, connection, input, scope),
      ]);

      const details = await resolve.call(
        provider,
        key,
        // OpenFeature requires a default of the correct type, and providers
        // examine it. Without one, the SDK passes a placeholder (see the spec).
        defaultValue ?? placeholderOf(type),
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
      if (details.reason === 'ERROR') {
        throw new FlagEvaluationError(
          key,
          'GENERAL',
          details.errorMessage ?? 'The provider reported an error.',
        );
      }
      // Without a defaultValue, the default of the code is only a placeholder
      if (defaultValue === undefined && codeDefault in details) {
        throw new FlagEvaluationError(
          key,
          'GENERAL',
          'The provider asks for the default value, but the flag has no defaultValue.',
        );
      }
      if (!hasType(details.value, type)) {
        throw new FlagEvaluationError(
          key,
          'TYPE_MISMATCH',
          `Expected a ${type}, got ${typeName(details.value)}`,
        );
      }
      if (options && !isOption(details.value, options)) {
        throw new FlagEvaluationError(
          key,
          'TYPE_MISMATCH',
          `The value is not one of the options: ${describeValue(details.value)}`,
        );
      }
      return details.value as FlagValue;
    } catch (error) {
      // A signal of the framework must reach the framework unchanged
      this.#rethrow?.(error);
      const evaluationError = toEvaluationError(key, error);
      if (defaultValue === undefined) throw evaluationError;
      // One line per evaluation, so a broken flag does not fill the logs
      logger.error(
        `${evaluationError.message.replace(/\.$/, '')}. Returned the default value: ${formatValue(defaultValue)}.`,
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
    this.#integration = undefined;
    this.#rethrow = undefined;
    this.#configSource = undefined;
    this.#loadedConfig = undefined;
  }

  /**
   * Loads the configuration of the config source: one time in production,
   * before each evaluation in development.
   */
  #loadConfig(): Promise<void> {
    const source = this.#configSource;
    if (!source) return Promise.resolve();
    const reload = process.env.NODE_ENV !== 'production';
    if (this.#loadedConfig && !reload) return this.#loadedConfig;

    const loading = Promise.resolve()
      .then(source)
      .then((config) => {
        if (config && config !== this.#config) this.configure(config);
      })
      .catch((error: unknown) => {
        if (this.#loadedConfig === loading) this.#loadedConfig = undefined;
        throw error;
      });
    this.#loadedConfig = loading;
    return loading;
  }

  /**
   * Calls the framework integration one time (see `flags/integration`). If
   * it fails, the next call tries again.
   */
  #setUpIntegration(): Promise<void> {
    if (!setupIntegration) return Promise.resolve();
    const setup = setupIntegration;
    this.#integration ??= Promise.resolve()
      .then(() => setup(this))
      .catch((error: unknown) => {
        this.#integration = undefined;
        throw error;
      });
    return this.#integration;
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

  /**
   * The providers which `onInit` and `onInvoke` initialize. The default
   * connection of the configuration always counts, the built-in one only when
   * a flag uses it. Thus, a new configuration replaces the old default.
   */
  #registeredProviders(): Provider[] {
    const connections = [...this.#connections];
    if (this.#config.defaultConnection) {
      connections.push(this.#config.defaultConnection);
    } else if (this.#usesDefaultConnection) {
      connections.push(getBuiltInConnection());
    }
    return [...new Set(connections.map((c) => c.provider))];
  }

  /**
   * Closes a provider which was initialized, if no registered connection
   * uses it any more.
   */
  #closeUnusedProvider(provider: Provider): void {
    const initialization = this.#initializations.get(provider);
    if (!initialization || this.#registeredProviders().includes(provider)) {
      return;
    }
    this.#initializations.delete(provider);
    initialization
      .then(() => provider.onClose?.())
      .catch((error: unknown) => {
        logger.error(
          `flags: Could not close provider "${provider.metadata.name}".`,
          error,
        );
      });
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
