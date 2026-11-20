/**
 * The subpath `flags/hooks`: the hooks for all flags. A framework plugin
 * replaces it with a bundler alias of `flags/hooks.ts` of the application.
 * Without the file, there are no hooks.
 */
import type { Hook } from './types';

const hooks: readonly Hook[] = [];

export default hooks;
