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
      // Warn during build so developers notice the issue
      const isBuildStep =
        process.env.NEXT_PHASE === 'phase-production-build' ||
        process.env.CI === '1';

      if (isBuildStep) {
        console.warn(`
╔════════════════════════════════════════════════════════════════════════════╗
║                                                                            ║
║  @vercel/flags-core: No bundled definitions found                          ║
║                                                                            ║
║  The fallback definitions file was not found. This means your app will     ║
║  not be able to resolve flags if Vercel Flags is unavailable.              ║
║                                                                            ║
╚════════════════════════════════════════════════════════════════════════════╝
`);
      }

      return { definitions: null, state: 'missing-file' };
    }

    return { definitions: null, state: 'unexpected-error', error };
  }

  const entry = get(sdkKey);
  if (!entry) return { definitions: null, state: 'missing-entry' };
  return { definitions: entry, state: 'ok' };
}
