/**
 * The subpath `flags/framework`: the binding of the framework. The build
 * plugin of a framework replaces this module with a bundler alias, e.g.
 * `withFlags` of `@flags-sdk/next/plugin` with `@flags-sdk/next/binding`.
 *
 * Without a plugin, there is no binding: the application passes the request
 * itself, e.g. `flag(request)`.
 */
import type { FrameworkBinding } from './lib/framework';

export const binding: FrameworkBinding | undefined = undefined;
