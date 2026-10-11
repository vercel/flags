/**
 * A Nitro plugin of the module `flags/nuxt`: it initializes the providers
 * when the server starts, and closes them when it stops.
 */
import { defineNitroPlugin } from '#imports';
import { runtime } from './runtime';

export default defineNitroPlugin((nitroApp) => {
  void runtime.onInit();
  nitroApp.hooks.hook('close', () => runtime.onShutdown());
});
