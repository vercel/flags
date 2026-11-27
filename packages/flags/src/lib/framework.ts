import type { ReadonlyHeaders } from '../spec-extension/adapters/headers';
import type { ReadonlyRequestCookies } from '../spec-extension/adapters/request-cookies';

/**
 * The current request, as a framework gives it to the SDK.
 *
 * @internal
 */
export interface FrameworkRequest {
  /**
   * The headers of the request. The framework gives the same object during
   * one request, so the SDK uses it as the key of its caches of the request.
   */
  readonly headers: ReadonlyHeaders;
  /** The cookies of the request. */
  readonly cookies: ReadonlyRequestCookies;
}

/**
 * How a framework gives the SDK the current request. The framework entries
 * (`flags/next`, `flags/sveltekit`) each have one, e.g. `next/binding.ts`
 * with `headers()` and `cookies()` of `next/headers`.
 *
 * The SDK reads the request only through a binding. This is the seam where a
 * framework, or later a bundler alias of a build plugin, can supply the
 * request instead of the entry.
 *
 * @internal
 */
export interface FrameworkBinding {
  /** The name of the framework, e.g. `next`. */
  readonly name: string;
  /**
   * The headers of the current request. Throws outside of a request, with
   * the error of the framework.
   */
  getHeaders(): Promise<ReadonlyHeaders>;
  /**
   * The headers and the cookies of the current request. Throws outside of a
   * request, with the error of the framework.
   */
  getRequest(): Promise<FrameworkRequest>;
  /**
   * Whether an error is a signal of the framework, e.g. `notFound()` or
   * `redirect()`, which the SDK must throw again and never turn into a
   * default value.
   */
  isFrameworkSignal(error: unknown): boolean;
}

interface FrameworkState {
  binding?: FrameworkBinding;
}

// All copies of the package in one process share the binding, e.g. the
// copies of the layers of Next.js. The key has the major version.
const key = Symbol.for('flags.v4.framework');
const store = globalThis as unknown as Record<
  symbol,
  FrameworkState | undefined
>;
store[key] ??= {};
const state: FrameworkState = store[key];

/**
 * Supplies the binding of the framework. It replaces the binding of the
 * framework entry, e.g. in tests. `undefined` removes it.
 *
 * @internal
 */
export function setFramework(binding: FrameworkBinding | undefined): void {
  state.binding = binding;
}

/**
 * The binding of the framework: the supplied one, or else the binding of the
 * framework entry which calls it.
 *
 * @internal
 */
export function getFramework(entryBinding: FrameworkBinding): FrameworkBinding {
  return state.binding ?? entryBinding;
}
