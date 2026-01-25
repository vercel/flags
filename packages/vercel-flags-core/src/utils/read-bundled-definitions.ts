// The definitions.json file is created at build time by the customer's app
// in node_modules/@vercel/flags-definitions/. This is a fallback
// mechanism used so the app can always fall back to a bundled version of
// the definitions, even if the flags network is degraded or unavailable.
//
// At build time of the customer's app, the definitions.json file is created
// using the "vercel-flags prepare" script, which also creates a package.json
// that exports definitions.json.
//
// If the "vercel-flags prepare" script did not run, the import will fail
// and we return null.
import type { BundledDefinitions, BundledDefinitionsResult } from '../types';

type DefinitionsJson = Record<string, BundledDefinitions>;

/**
 * Reads the local definitions that get bundled at build time (definitions.json).
 */
export async function readBundledDefinitions(
  id: string,
): Promise<BundledDefinitionsResult> {
  let stores: DefinitionsJson;
  try {
    stores = await import(
      // @ts-expect-error this only exists at build time
      '@vercel/flags-definitions/definitions.json'
    );
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

  const entry = stores && Object.hasOwn(stores, id) ? stores[id] : null;
  if (!entry) return { definitions: null, state: 'missing-entry' };
  return { definitions: entry, state: 'ok' };
}
