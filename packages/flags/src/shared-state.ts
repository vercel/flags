/**
 * The state which all copies of the package in one process share. A bundler
 * can put more than one copy of the package into an application, e.g. one
 * for each layer of Next.js. With one shared state, `instrumentation.ts` and
 * the pages use the same runtime.
 *
 * The key contains the major version, because a different major version can
 * have a different runtime.
 */
interface SharedState {
  readonly connections: WeakSet<object>;
  readonly flags: WeakSet<object>;
  runtime?: unknown;
  defaultConnection?: unknown;
  /**
   * The framework binding of the first copy which has one. A copy without
   * the alias of `flags/framework`, e.g. in the process of the build tool,
   * must not hide the binding of a copy in the server code.
   */
  setupFramework?: unknown;
}

const key = Symbol.for('flags.v5.state');
const store = globalThis as unknown as Record<symbol, SharedState | undefined>;

/**
 * @internal
 */
store[key] ??= { connections: new WeakSet(), flags: new WeakSet() };
export const sharedState: SharedState = store[key];
