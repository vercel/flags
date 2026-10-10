import type { Config } from './config';

/**
 * The configuration of the application. This module is the subpath
 * `flags/config`. A framework plugin replaces it with a bundler alias of
 * `flags.config.ts`, so that the integration can load it with
 * `import('flags/config')`.
 *
 * Without a plugin, there is no configuration here.
 */
export const config: Config | undefined = undefined;
