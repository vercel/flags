/**
 * A Nitro plugin of the module `@flags-sdk/nuxt`:
 *
 * - It registers the framework binding. Nitro loads `flags` from
 *   `node_modules` in development, so the alias of `flags/framework` does not
 *   reach the SDK there. Nitro always bundles its plugins.
 * - It initializes the providers when the server starts, and closes them
 *   when it stops.
 */
import { runtime } from 'flags';
import { registerFramework } from 'flags/tooling';
import { defineNitroPlugin } from '#imports';
import { setupFramework } from './binding';

registerFramework(setupFramework);

export default defineNitroPlugin((nitroApp) => {
  void runtime.onInit();
  nitroApp.hooks.hook('close', () => runtime.onShutdown());
});
