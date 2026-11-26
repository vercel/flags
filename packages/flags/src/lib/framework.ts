import { binding as aliasedBinding } from 'flags/framework';
import type { ReadonlyHeaders } from '../spec-extension/adapters/headers';
import type { ReadonlyRequestCookies } from '../spec-extension/adapters/request-cookies';
import { addEnv } from './vercel-platform';

/**
 * The current request, as a framework gives it to the SDK.
 */
export interface FrameworkRequest {
  /**
   * The headers of the request. The framework gives the same object during
   * one request, so the SDK uses it as the key of its caches of the request.
   */
  readonly headers: ReadonlyHeaders;
  /**
   * The cookies of the request. Without them, the SDK reads the `Cookie`
   * header.
   */
  readonly cookies?: ReadonlyRequestCookies;
}

/**
 * How a framework gives the SDK the current request. A framework package
 * exports one from the module which its build plugin puts behind the alias
 * `flags/framework`, e.g. `@flags-sdk/next/binding`:
 *
 * ```ts
 * export const binding: FrameworkBinding = { ... };
 * ```
 *
 * The module must not import `flags` at runtime, because `flags` imports it.
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
  /**
   * Environment variables which the framework has, but `process.env` has
   * not, e.g. `$env` of SvelteKit during `vite dev`. The SDK calls it one
   * time, before it reads a secret.
   */
  loadEnv?(): Promise<Record<string, string | undefined>>;
}

interface FrameworkState {
  /** The binding of the alias `flags/framework` of the first copy with one */
  aliased?: FrameworkBinding;
  /** A binding which replaces it, e.g. in tests */
  override?: FrameworkBinding;
  envLoaded?: Promise<void>;
}

// All copies of the package in one process share the binding, e.g. the
// copies of the layers of Next.js. A copy without the alias, e.g. in the
// process of the build tool, must not hide the binding of a copy with it.
const key = Symbol.for('flags.v5.framework');
const store = globalThis as unknown as Record<
  symbol,
  FrameworkState | undefined
>;
store[key] ??= {};
const state: FrameworkState = store[key];
state.aliased ??= aliasedBinding;

/**
 * Replaces the binding of the framework, e.g. in tests. `undefined` goes
 * back to the binding of the alias `flags/framework`.
 *
 * @internal
 */
export function setFramework(binding: FrameworkBinding | undefined): void {
  state.override = binding;
  state.envLoaded = undefined;
}

/**
 * The binding of the framework, if there is one.
 *
 * @internal
 */
export function getFramework(): FrameworkBinding | undefined {
  return state.override ?? state.aliased;
}

/**
 * The binding of the framework. Throws a clear error without one: the
 * application has no build plugin of a framework.
 *
 * @internal
 */
export function requireFramework(): FrameworkBinding {
  const binding = getFramework();
  if (!binding) {
    throw new Error(
      'flags: No framework gives the current request. In Next.js, wrap the configuration in next.config.ts with withFlags of @flags-sdk/next/plugin. In SvelteKit, add flags() of @flags-sdk/sveltekit/vite to vite.config.ts. Outside of a framework, pass the request, e.g. flag(request).',
    );
  }
  return binding;
}

/**
 * Whether an error is a signal of the framework, which the SDK must throw
 * again.
 *
 * @internal
 */
export function isFrameworkSignal(error: unknown): boolean {
  return getFramework()?.isFrameworkSignal(error) ?? false;
}

/**
 * Gives the SDK the environment of the framework one time, before it reads
 * a secret.
 *
 * @internal
 */
export function loadFrameworkEnv(): Promise<void> {
  const binding = getFramework();
  if (!binding?.loadEnv) {
    return Promise.resolve();
  }
  state.envLoaded ??= binding.loadEnv().then(
    (env) => {
      addEnv(env);
    },
    () => {
      // Without the environment of the framework, process.env stays
    },
  );
  return state.envLoaded;
}
