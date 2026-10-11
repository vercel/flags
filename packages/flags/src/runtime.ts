import { AsyncLocalStorage } from 'node:async_hooks';
import stringify from 'fast-json-stable-stringify';
import { setupIntegration } from 'flags/integration';
import type { Config } from './config';
import { type Connection, isConnection } from './connection';
import { getBuiltInConnection } from './default-connection';
import { FlagEvaluationError, toEvaluationError } from './errors';
import type { Evaluate } from './evaluate';
import { HookRun, OVERRIDE_REASON } from './hooks';
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
  EvaluationDetails,
  EventDetails,
  EventHandler,
  FlagsRequest,
  FlagsRequestInit,
  Hook,
  HookHints,
  Logger,
  Provider,
  ProviderEvent,
  ProviderEventDetails,
  ResolutionDetails,
  TrackingEventDetails,
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
   * What the flag is for, e.g. for Flags Explorer.
   */
  readonly description?: string;
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

type ResolveMethod = (
  flagKey: string,
  defaultValue: FlagValue,
  context: EvaluationContext,
  logger: Logger,
) => Promise<ResolutionDetails<unknown>>;

/**
 * The options of the call side for an evaluation.
 */
interface CallOptions {
  readonly evaluationContext?: unknown;
  readonly hooks?: readonly Hook[];
  readonly hookHints?: HookHints;
}

/**
 * The status of a provider which was initialized. OpenFeature has the same
 * statuses. A provider without a status is not ready.
 */
type ProviderStatus = 'READY' | 'ERROR' | 'STALE' | 'FATAL';

const providerEvents: readonly ProviderEvent[] = [
  'PROVIDER_READY',
  'PROVIDER_ERROR',
  'PROVIDER_CONFIGURATION_CHANGED',
  'PROVIDER_STALE',
];

/**
 * Whether a handler which is added later must run at once, because the
 * provider already has the status of the event (OpenFeature 5.3.3).
 */
function statusMatchesEvent(
  status: ProviderStatus,
  event: ProviderEvent,
): boolean {
  if (event === 'PROVIDER_READY') return status === 'READY';
  if (event === 'PROVIDER_ERROR')
    return status === 'ERROR' || status === 'FATAL';
  if (event === 'PROVIDER_STALE') return status === 'STALE';
  return false;
}

function isFatal(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'PROVIDER_FATAL'
  );
}

/**
 * A rejected promise which is not an unhandled rejection, because the
 * callers handle it later.
 */
function handledRejection(error: unknown): Promise<never> {
  const promise = Promise.reject(error);
  promise.catch(() => {});
  return promise;
}

/**
 * Whether a value is plain data: primitives, arrays and plain objects. Only
 * plain data can be compared by its content. A `Date`, a `Map`, an instance
 * of a class, a function or a circular object is not plain data.
 */
function isPlainData(value: unknown, parents = new Set<object>()): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value !== 'object' || parents.has(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  const isArray = Array.isArray(value);
  if (!isArray && prototype !== Object.prototype && prototype !== null) {
    return false;
  }
  parents.add(value);
  const plain = Object.values(value).every((item) =>
    isPlainData(item, parents),
  );
  parents.delete(value);
  return plain;
}

/**
 * Results for one owner, e.g. one step, by their input. Plain data is
 * compared by its content: `{ x: 1 }` and a different `{ x: 1 }` are the same
 * input, also with the keys in a different order. Other objects are compared
 * by identity.
 */
class ResultsByInput {
  readonly #objects = new WeakMap<object, Promise<unknown>>();
  readonly #values = new Map<unknown, Promise<unknown>>();
  readonly #contents = new Map<string, Promise<unknown>>();

  get(input: unknown, create: () => Promise<unknown>): Promise<unknown> {
    if (typeof input !== 'object' || input === null) {
      return cached(this.#values, input, create);
    }
    if (isPlainData(input)) {
      return cached(this.#contents, stringify(input), create);
    }
    return cached(this.#objects, input, create);
  }
}

function cached<K>(
  map: {
    get(key: K): Promise<unknown> | undefined;
    set(key: K, value: Promise<unknown>): unknown;
  },
  key: K,
  create: () => Promise<unknown>,
): Promise<unknown> {
  const existing = map.get(key);
  if (existing) return existing;
  const result = create();
  map.set(key, result);
  return result;
}

/**
 * The state of one request. Each step of the context chain runs once per
 * input object, and each flag is evaluated once per input object.
 */
class RequestScope {
  readonly request: FlagsRequest;
  readonly #steps = new Map<Step, ResultsByInput>();
  readonly #flags = new WeakMap<FlagDefinition, ResultsByInput>();

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
    let results = this.#steps.get(step);
    if (!results) {
      results = new ResultsByInput();
      this.#steps.set(step, results);
    }
    return results.get(input, () => callStep(step, owner, input, this.request));
  }

  /**
   * Returns the result of the flag for this input in this request, or
   * evaluates the flag. Also a failure is kept, so that the request gets the
   * same result each time.
   */
  evaluate(
    flag: FlagDefinition,
    input: unknown,
    evaluate: () => Promise<FlagValue>,
  ): Promise<FlagValue> {
    let results = this.#flags.get(flag);
    if (!results) {
      results = new ResultsByInput();
      this.#flags.set(flag, results);
    }
    return results.get(input, evaluate) as Promise<FlagValue>;
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
  readonly #statuses = new Map<Provider, ProviderStatus>();
  readonly #subscriptions = new Map<Provider, () => void>();
  readonly #handlers = new Map<ProviderEvent, Set<EventHandler>>();

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
    if (config.hooks !== undefined && !Array.isArray(config.hooks)) {
      throw new Error(
        'flags: The hooks of the configuration must be an array.',
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
   * Sets up the framework integration and loads the configuration, without
   * the initialization of providers. For tools, e.g. the route of the
   * manifest, which need the default connection of the configuration.
   *
   * @internal
   */
  async prepare(): Promise<void> {
    await this.#setUpIntegration();
    await this.#loadConfig();
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
    for (const provider of [...this.#subscriptions.keys()]) {
      this.#unsubscribe(provider);
    }
    this.#statuses.clear();
  }

  /**
   * Adds a handler for an event of the providers, e.g.
   * `PROVIDER_CONFIGURATION_CHANGED`. Like `OpenFeature.addHandler`, it runs
   * for the events of all providers. The runtime emits `PROVIDER_READY` and
   * `PROVIDER_ERROR` when an initialization ends, and gives the events of
   * the providers to the handlers.
   *
   * If a provider already has the status of the event, e.g. it is ready, the
   * handler runs at once. Errors of handlers are logged.
   *
   * @example
   * ```ts
   * runtime.addHandler('PROVIDER_CONFIGURATION_CHANGED', (details) => {
   *   console.log(`${details.providerName}: ${details.flagsChanged}`);
   * });
   * ```
   */
  addHandler(event: ProviderEvent, handler: EventHandler): void {
    let handlers = this.#handlers.get(event);
    if (!handlers) {
      handlers = new Set();
      this.#handlers.set(event, handlers);
    }
    handlers.add(handler);
    for (const [provider, status] of this.#statuses) {
      if (statusMatchesEvent(status, event)) {
        this.#callHandler(handler, { providerName: provider.metadata.name });
      }
    }
  }

  /**
   * Removes a handler of `addHandler`.
   */
  removeHandler(event: ProviderEvent, handler: EventHandler): void {
    this.#handlers.get(event)?.delete(handler);
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

    this.#subscribe(provider);
    let started: Promise<void>;
    try {
      // Call synchronously, so the work starts immediately
      started = Promise.resolve(provider.initialize?.());
    } catch (error) {
      started = Promise.reject(error);
    }

    const initialization: Promise<void> = started.then(
      () => {
        if (this.#initializations.get(provider) !== initialization) return;
        this.#handleEvent(provider, 'PROVIDER_READY', {}, true);
      },
      (error: unknown) => {
        // Only forget this attempt, not a newer one started after a shutdown
        if (this.#initializations.get(provider) === initialization) {
          // A fatal error is not retried (OpenFeature PROVIDER_FATAL)
          if (!isFatal(error)) this.#initializations.delete(provider);
          this.#handleEvent(
            provider,
            'PROVIDER_ERROR',
            {
              message: error instanceof Error ? error.message : String(error),
              errorCode: isFatal(error) ? 'PROVIDER_FATAL' : 'GENERAL',
            },
            true,
          );
        }
        throw error;
      },
    );
    this.#initializations.set(provider, initialization);
    return initialization;
  }

  /**
   * Evaluates one flag or several flags. The same as the `evaluate` function
   * which the package exports.
   */
  readonly evaluate: Evaluate = ((
    flags: FlagDefinition | readonly FlagDefinition[],
    options?: CallOptions,
  ) => {
    return Array.isArray(flags)
      ? Promise.all(flags.map((flag) => this.#evaluateFlag(flag, options)))
      : this.#evaluateFlag(flags as FlagDefinition, options);
  }) as Evaluate;

  /**
   * Records a tracking event with the provider of the connection. The same
   * as the `track` function which the package exports.
   *
   * @internal
   */
  async track(
    connection: Connection | undefined,
    eventName: string,
    options?: {
      evaluationContext?: unknown;
      details?: TrackingEventDetails;
    },
  ): Promise<void> {
    try {
      await this.#setUpIntegration();
      await this.#loadConfig();
      const target = connection ?? this.defaultConnection;
      const { provider } = target;
      // A provider without track ignores the event, as in OpenFeature
      if (!provider.track) return;
      const scope = this.#storage.getStore() ?? (await this.#scopeFromSource());
      // OpenFeature does not call track on a provider which is not ready
      const [, context] = await Promise.all([
        this.initializeProvider(provider),
        this.#evaluationContext(
          undefined,
          target,
          options?.evaluationContext,
          scope,
        ),
      ]);
      provider.track(eventName, context, options?.details ?? {});
    } catch (error) {
      this.#rethrow?.(error);
      // As in OpenFeature, tracking does not throw
      logger.error(`flags: Could not track event "${eventName}".`, error);
    }
  }

  /**
   * Runs the chain: the call side gives `input` to the flag, the flag to the
   * connection, and the connection to the provider. A missing step gives its
   * input to the next step as it is.
   */
  async #evaluationContext(
    flag: FlagDefinition | undefined,
    connection: Connection,
    input: unknown,
    scope: RequestScope | undefined,
  ): Promise<EvaluationContext> {
    const run = (step: Step, owner: object, value: unknown) =>
      scope
        ? scope.run(step, owner, value)
        : callStep(step, owner, value, undefined);

    let context = input;
    if (flag?.getEvaluationContext) {
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

  /**
   * Evaluates a flag once per request and input. A call with its own hooks
   * gets its own evaluation, so that its hooks run.
   */
  async #evaluateFlag(
    flag: FlagDefinition,
    call: CallOptions | undefined,
  ): Promise<FlagValue> {
    // The integration can configure the default connection and the request
    // source, so it must run first
    let setupError: unknown;
    let scope: RequestScope | undefined;
    try {
      await this.#setUpIntegration();
      await this.#loadConfig();
      scope = this.#storage.getStore() ?? (await this.#scopeFromSource());
    } catch (error) {
      setupError = error;
    }
    const evaluate = () => this.#evaluateOnce(flag, call, scope, setupError);
    if (!scope || call?.hooks || call?.hookHints) return evaluate();
    return scope.evaluate(flag, call?.evaluationContext, evaluate);
  }

  async #evaluateOnce(
    flag: FlagDefinition,
    call: CallOptions | undefined,
    scope: RequestScope | undefined,
    setupError: unknown,
  ): Promise<FlagValue> {
    const { key, defaultValue, options } = flag;
    const type = flag.type ?? 'boolean';
    const connection = flag.connection ?? this.defaultConnection;
    if (!isConnection(connection)) {
      throw new Error(
        `flags: The connection of flag "${key}" must be returned by defineConnection.`,
      );
    }
    const { provider } = connection;
    // OpenFeature requires a default of the correct type, and providers
    // examine it. Without one, the SDK passes a placeholder (see the spec).
    const fallback = defaultValue ?? placeholderOf(type);
    // The order of OpenFeature: API (configuration), client (connection),
    // invocation (call side), provider. They also run for an override, with
    // the reason OVERRIDE.
    const allHooks = [
      ...(this.#config.hooks ?? []),
      ...(connection.hooks ?? []),
      ...(call?.hooks ?? []),
      ...(provider.hooks ?? []),
    ];

    let hooks: HookRun | undefined;
    let details: EvaluationDetails<FlagValue> | undefined;
    let failure: FlagEvaluationError | undefined;
    try {
      if (setupError !== undefined) throw setupError;

      let override = scope
        ? (await scope.overrides(this.#readOverrides)).get(key)
        : undefined;
      if (override !== undefined) {
        const problem = valueProblem(override, type, options);
        if (problem) {
          logger.warn(
            `flags: The override of flag "${key}" was ignored, because ${problem}.`,
          );
          override = undefined;
        } else if (allHooks.length === 0) {
          return override as FlagValue;
        }
      }

      // An override skips the provider and its initialization
      const resolve =
        override === undefined
          ? this.#resolveMethod(key, provider, type)
          : undefined;
      const initialization = resolve
        ? this.initializeProvider(provider)
        : undefined;
      // It is awaited below. An early error must not make it unhandled.
      initialization?.catch(() => {});

      const context = await this.#evaluationContext(
        flag,
        connection,
        call?.evaluationContext,
        scope,
      );
      if (allHooks.length > 0) {
        hooks = new HookRun({
          hooks: allHooks,
          hints: call?.hookHints,
          flagKey: key,
          defaultValue: fallback,
          type,
          provider,
          context,
        });
        await hooks.before();
      }

      if (resolve) {
        await initialization;
        details = await this.#resolve(
          flag,
          type,
          provider,
          resolve,
          fallback,
          hooks?.context ?? context,
        );
      } else {
        details = {
          flagKey: key,
          value: override as FlagValue,
          reason: OVERRIDE_REASON,
          flagMetadata: Object.freeze({}),
        };
      }
      await hooks?.after(details);
    } catch (error) {
      // A signal of the framework must reach the framework unchanged
      this.#rethrow?.(error);
      failure = toEvaluationError(key, error);
    }

    if (!failure && details) {
      await hooks?.finally(details);
      return details.value;
    }
    const evaluationError =
      failure ?? new FlagEvaluationError(key, 'GENERAL', 'No result.');
    await hooks?.error(evaluationError);
    await hooks?.finally({
      flagKey: key,
      value: fallback,
      reason: 'ERROR',
      errorCode: evaluationError.code,
      errorMessage: evaluationError.message,
      flagMetadata: Object.freeze({}),
    });
    if (defaultValue === undefined) throw evaluationError;
    // One line per evaluation, so a broken flag does not fill the logs
    logger.error(
      `${evaluationError.message.replace(/\.$/, '')}. Returned the default value: ${formatValue(defaultValue)}.`,
    );
    logger.debug(evaluationError);
    return defaultValue;
  }

  #resolveMethod(
    key: string,
    provider: Provider,
    type: FlagType,
  ): ResolveMethod {
    const resolve = provider[resolveMethodOf[type]] as
      | ResolveMethod
      | undefined;
    if (!resolve) {
      throw new FlagEvaluationError(
        key,
        'GENERAL',
        `The provider "${provider.metadata.name}" does not support ${type} flags.`,
      );
    }
    return resolve;
  }

  /**
   * Calls the provider and checks its result.
   */
  async #resolve(
    flag: FlagDefinition,
    type: FlagType,
    provider: Provider,
    resolve: ResolveMethod,
    fallback: FlagValue,
    context: EvaluationContext,
  ): Promise<EvaluationDetails<FlagValue>> {
    const { key, defaultValue, options } = flag;
    const resolution = await resolve.call(
      provider,
      key,
      fallback,
      context,
      logger,
    );

    if (resolution.errorCode) {
      throw new FlagEvaluationError(
        key,
        resolution.errorCode,
        resolution.errorMessage ?? resolution.errorCode,
      );
    }
    if (resolution.reason === 'ERROR') {
      throw new FlagEvaluationError(
        key,
        'GENERAL',
        resolution.errorMessage ?? 'The provider reported an error.',
      );
    }
    // Without a defaultValue, the default of the code is only a placeholder
    if (defaultValue === undefined && codeDefault in resolution) {
      throw new FlagEvaluationError(
        key,
        'GENERAL',
        'The provider asks for the default value, but the flag has no defaultValue.',
      );
    }
    if (!hasType(resolution.value, type)) {
      throw new FlagEvaluationError(
        key,
        'TYPE_MISMATCH',
        `Expected a ${type}, got ${typeName(resolution.value)}`,
      );
    }
    if (options && !isOption(resolution.value, options)) {
      throw new FlagEvaluationError(
        key,
        'TYPE_MISMATCH',
        `The value is not one of the options: ${describeValue(resolution.value)}`,
      );
    }
    return {
      value: resolution.value as FlagValue,
      variant: resolution.variant,
      reason: resolution.reason,
      flagKey: key,
      flagMetadata: Object.freeze({ ...resolution.flagMetadata }),
    };
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
    for (const provider of [...this.#subscriptions.keys()]) {
      this.#unsubscribe(provider);
    }
    this.#statuses.clear();
    this.#handlers.clear();
  }

  /**
   * Listens to the events of a provider, one time until it is closed.
   */
  #subscribe(provider: Provider): void {
    const { events } = provider;
    if (!events || this.#subscriptions.has(provider)) return;
    const listeners = providerEvents.map((event) => {
      const listener = (details?: ProviderEventDetails) =>
        this.#handleEvent(provider, event, details ?? {});
      events.addHandler(event, listener);
      return [event, listener] as const;
    });
    this.#subscriptions.set(provider, () => {
      for (const [event, listener] of listeners) {
        events.removeHandler(event, listener);
      }
    });
  }

  #unsubscribe(provider: Provider): void {
    try {
      this.#subscriptions.get(provider)?.();
    } catch (error) {
      logger.error(
        `flags: Could not remove the event handlers of provider "${provider.metadata.name}".`,
        error,
      );
    }
    this.#subscriptions.delete(provider);
    this.#statuses.delete(provider);
  }

  /**
   * Updates the status of the provider, and gives the event to the handlers.
   */
  #handleEvent(
    provider: Provider,
    event: ProviderEvent,
    details: ProviderEventDetails,
    // The rejected initialization already keeps the fatal error
    fromInitialization = false,
  ): void {
    const previous = this.#statuses.get(provider);
    // FATAL does not change any more (OpenFeature)
    if (previous !== 'FATAL') {
      if (event === 'PROVIDER_READY') this.#statuses.set(provider, 'READY');
      if (event === 'PROVIDER_STALE') this.#statuses.set(provider, 'STALE');
      if (event === 'PROVIDER_ERROR') {
        const fatal = details.errorCode === 'PROVIDER_FATAL';
        this.#statuses.set(provider, fatal ? 'FATAL' : 'ERROR');
        // The next evaluations fail at once, and are not retried
        if (fatal && !fromInitialization) {
          const error = Object.assign(
            new Error(
              details.message ??
                `The provider "${provider.metadata.name}" reported a fatal error.`,
            ),
            { code: 'PROVIDER_FATAL' },
          );
          this.#initializations.set(provider, handledRejection(error));
        }
      }
    }
    const handlers = this.#handlers.get(event);
    if (!handlers) return;
    for (const handler of handlers) {
      this.#callHandler(handler, {
        ...details,
        providerName: provider.metadata.name,
      });
    }
  }

  #callHandler(handler: EventHandler, details: EventDetails): void {
    const report = (error: unknown) =>
      logger.error('flags: An event handler failed.', error);
    try {
      Promise.resolve(handler(details)).catch(report);
    } catch (error) {
      report(error);
    }
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
    this.#unsubscribe(provider);
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
