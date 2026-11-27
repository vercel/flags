import { AsyncLocalStorage } from 'node:async_hooks';
import { loadFrameworkEnv, requireFramework } from './lib/framework';
import { getOverrides } from './lib/overrides';
import {
  createFlagsRequest,
  type FlagsRequest,
  type FlagsRequestInit,
} from './request';

/**
 * The state of one request: its standard request, the values of the flags
 * which it evaluated, and what each flag of the request shares. Nothing is
 * shared between requests.
 *
 * @internal
 */
export class RequestScope {
  /**
   * The object which identifies the request: the headers which the
   * framework gives, or else the init.
   */
  readonly key: object;
  readonly request: FlagsRequest;
  /**
   * The value of each flag, by key and by entities. The promise is kept, so
   * that concurrent calls share one evaluation, and also a failure.
   */
  readonly #values = new Map<string, Map<string, Promise<unknown>>>();
  /**
   * The argument of `identify`: the same object for all flags of the
   * request, so that an identify function of `dedupe` runs one time.
   */
  readonly identifyParams: Pick<FlagsRequest, 'headers' | 'cookies'>;
  #overrides: Promise<Record<string, unknown> | null> | undefined;

  constructor(key: object, request: FlagsRequest) {
    this.key = key;
    this.request = request;
    this.identifyParams = {
      headers: request.headers,
      cookies: request.cookies,
    };
  }

  /**
   * The overrides of the `vercel-flag-overrides` cookie, read one time for
   * the request.
   */
  overrides(): Promise<Record<string, unknown> | null> {
    this.#overrides ??= readOverrides(this.request);
    return this.#overrides;
  }

  value(key: string, entitiesKey: string): Promise<unknown> | undefined {
    return this.#values.get(key)?.get(entitiesKey);
  }

  setValue(key: string, entitiesKey: string, value: Promise<unknown>): void {
    let byEntities = this.#values.get(key);
    if (!byEntities) {
      byEntities = new Map();
      this.#values.set(key, byEntities);
    }
    byEntities.set(entitiesKey, value);
  }

  /**
   * The values of the flags which the request evaluated, by key. A flag
   * which the request evaluated with different entities has the value of
   * its first evaluation. A flag whose evaluation failed is left out.
   */
  async evaluatedValues(): Promise<Record<string, unknown>> {
    const entries = await Promise.all(
      [...this.#values].map(async ([key, byEntities]) => {
        const first = byEntities.values().next().value;
        try {
          return [key, await first] as const;
        } catch {
          return undefined;
        }
      }),
    );
    return Object.fromEntries(entries.filter((entry) => entry !== undefined));
  }
}

function readOverrides(
  request: FlagsRequest,
): Promise<Record<string, unknown> | null> {
  const cookie = request.cookies.get('vercel-flag-overrides')?.value;
  if (typeof cookie !== 'string' || cookie === '') {
    return Promise.resolve(null);
  }
  // The secret can come from the environment of the framework
  return loadFrameworkEnv().then(() => getOverrides(cookie));
}

/**
 * The runtime of the Flags SDK: one instance for each application, for all
 * frameworks. It gives each evaluation the state of its request.
 *
 * A flag gets its request in this order:
 *
 * 1. The request which the call passes, e.g. `flag(request)` in the Pages
 *    Router of Next.js or in routing middleware.
 * 2. The request of `runtime.onInvoke`, for frameworks with a middleware
 *    which wraps the handler, e.g. the handle hook of SvelteKit.
 * 3. The current request of the framework binding, e.g. `headers()` and
 *    `cookies()` of Next.js, or `getRequestEvent()` of SvelteKit.
 *
 * The SDK identifies a request by its `headers` object. All three ways give
 * the same state for the same headers.
 */
class RuntimeImpl {
  readonly #storage = new AsyncLocalStorage<RequestScope>();
  readonly #scopes = new WeakMap<object, RequestScope>();

  /**
   * Call for each request. Pass the request of your framework, and the
   * function which continues to handle the request, e.g. `next` of a
   * middleware. Returns the result of `next`.
   *
   * Flags which are evaluated while `next` runs belong to this request, also
   * work which `next` starts and which ends later.
   *
   * @example
   * ```ts
   * // A middleware which wraps the handler
   * app.use((c, next) => runtime.onInvoke(c.req.raw, next));
   * ```
   */
  onInvoke<T>(
    request: FlagsRequestInit,
    next: () => T | Promise<T>,
  ): Promise<T> {
    return this.#storage.run(this.scopeOf(request), async () => next());
  }

  /**
   * The state of the request which the given headers or init identify.
   *
   * @internal
   */
  scopeOf(init: FlagsRequestInit): RequestScope {
    const key = init.headers ?? init;
    let scope = this.#scopes.get(key);
    if (!scope) {
      scope = new RequestScope(key, createFlagsRequest(init));
      this.#scopes.set(key, scope);
    }
    return scope;
  }

  /**
   * The state of the current request: of the passed request, of
   * `onInvoke`, or of the framework binding. Throws if there is none.
   *
   * @internal
   */
  async currentScope(request?: FlagsRequestInit): Promise<RequestScope> {
    if (request) {
      return this.scopeOf(request);
    }
    const stored = this.#storage.getStore();
    if (stored) {
      return stored;
    }
    // Each call reads the request of the framework, e.g. headers() of
    // Next.js, which makes the page dynamic, as expected for a flag
    return this.scopeOf(await requireFramework().getRequest());
  }

  /**
   * The object which identifies the current request: the key of its state.
   * Cheaper than `currentScope`, e.g. only `headers()` in Next.js.
   *
   * @internal
   */
  async currentKey(): Promise<object> {
    const stored = this.#storage.getStore();
    if (stored) {
      return stored.key;
    }
    return requireFramework().getHeaders();
  }

  /**
   * Runs `fn` with the state of a request, so that the flags which `fn`
   * evaluates without a request use it.
   *
   * @internal
   */
  runInScope<T>(scope: RequestScope, fn: () => Promise<T>): Promise<T> {
    if (this.#storage.getStore() === scope) {
      return fn();
    }
    return this.#storage.run(scope, fn);
  }
}

/**
 * The type of the `runtime`. Only a type, so that an application can not
 * create a second runtime.
 */
export type Runtime = RuntimeImpl;

// All copies of the package in one process share the runtime, e.g. the
// copies of the layers of Next.js. The key contains the major version.
const key = Symbol.for('flags.v5.runtime');
const store = globalThis as unknown as Record<symbol, Runtime | undefined>;
store[key] ??= new RuntimeImpl();

/**
 * The runtime of the application.
 */
export const runtime: Runtime = store[key];
