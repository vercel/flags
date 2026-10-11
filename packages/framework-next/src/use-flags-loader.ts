/**
 * The loader of `withFlags` for Turbopack. A module with the
 * `'use flags'` directive gets a self-registration at its end.
 */
import { basename } from 'node:path';
import { addSelfRegistration, hasUseFlagsDirective } from 'flags/tooling';

interface LoaderContext {
  readonly resourcePath: string;
}

export default function useFlagsLoader(
  this: LoaderContext,
  source: string,
): string {
  if (!hasUseFlagsDirective(source)) return source;
  return addSelfRegistration(source, basename(this.resourcePath));
}
