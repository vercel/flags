/**
 * The runtime of the Flags SDK, for framework packages and middlewares. An
 * application uses the framework package of its framework, which calls the
 * runtime.
 */
export type { FlagsRequest, FlagsRequestInit } from './request';
export { type Runtime, runtime } from './runtime';
