import type { Runtime } from './runtime';

/**
 * Sets up the framework integration, e.g. the request source and the
 * configuration. The runtime calls it one time, before the first
 * evaluation.
 */
export type SetupIntegration = (runtime: Runtime) => void | Promise<void>;

/**
 * The framework integration. This module is the subpath `flags/integration`.
 * The runtime imports it through its own package name, so that a framework
 * plugin can replace it with a bundler alias, e.g. with `flags/next`.
 *
 * The replacement exports `setupIntegration`. It must not import `flags`
 * statically, because `flags` imports it: it gets the runtime as an
 * argument, and it loads the configuration with a dynamic `import()`.
 *
 * Without a framework, there is no integration.
 */
export const setupIntegration: SetupIntegration | undefined = undefined;
