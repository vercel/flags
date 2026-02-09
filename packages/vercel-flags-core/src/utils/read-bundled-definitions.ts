// The @vercel/flags-definitions module is created at build time by Vercel CLI
// in node_modules/. This is a fallback mechanism used so the app can always
// fall back to a bundled version of the definitions, even if the flags network
// is degraded or unavailable.
//

import type { BundledDefinitions, BundledDefinitionsResult } from '../types';

/**
 * Reads the local definitions that get bundled at build time.
 */
export async function readBundledDefinitions(
  sdkKey: string,
): Promise<BundledDefinitionsResult> {
  let get: (sdkKey: string) => BundledDefinitions | null;
  try {
    const module = await import(
      /* turbopackOptional: true */
      // @ts-expect-error this only exists at build time
      '@vercel/flags-definitions'
    );
    get = module.get;
  } catch (error) {
    // If the module doesn't exist, the prepare script didn't run
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'MODULE_NOT_FOUND'
    ) {
      return { definitions: null, state: 'missing-file' };
    }

    return { definitions: null, state: 'unexpected-error', error };
  }

  const entry = get(sdkKey);
  if (!entry) return { definitions: null, state: 'missing-entry' };
  return { definitions: entry, state: 'ok' };
}
