import type { Runtime } from './runtime';

/**
 * Sets up the framework binding, e.g. the request source and the
 * configuration. The runtime calls it one time, before the first
 * evaluation.
 */
export type SetupFramework = (runtime: Runtime) => void | Promise<void>;

/**
 * The framework binding. This module is the subpath `flags/framework`.
 * The runtime imports it through its own package name, so that a framework
 * plugin can replace it with a bundler alias, e.g. with
 * `@flags-sdk/next/binding`.
 *
 * The replacement exports `setupFramework`. It must not import `flags`
 * statically, because `flags` imports it: it gets the runtime as an
 * argument, and it loads the configuration with a dynamic `import()`.
 *
 * Without a framework, there is no integration.
 */
export const setupFramework: SetupFramework | undefined = undefined;
