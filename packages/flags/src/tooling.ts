/**
 * Functions for framework packages and build tools, e.g. `@flags-sdk/next`
 * and `@flags-sdk/sveltekit`. Applications do not use them. They run in
 * Node.js, at build time or in the dev server.
 *
 * They are a public contract: a framework which provides the binding of the
 * Flags SDK itself uses them in the same way.
 */
export { MANIFEST_FILE, writeManifestFromBuild } from './lib/build-manifest';
export { hasUseFlagsDirective } from './lib/directive';
export { findFlagsModules } from './lib/find-flags-modules';
