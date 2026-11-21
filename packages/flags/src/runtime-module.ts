/**
 * The subpath `flags/runtime`: the runtime of the SDK, for framework
 * bindings and for applications without a framework plugin, e.g. with
 * Express, Hono or plain Node.js. With a framework plugin, an application
 * does not need it.
 *
 * All copies of the package in one process share the runtime, so this
 * subpath and `flags` use the same runtime.
 */
export type { Config } from './config';
export type { SetupFramework } from './framework';
export type {
  OverridesOptions,
  PlatformProject,
  VercelOverridesOptions,
} from './overrides';
export { registerFlags, registerSources } from './register';
export {
  type GetRequest,
  type LoadConfig,
  type Runtime,
  runtime,
} from './runtime';
export type { Settings } from './settings';
