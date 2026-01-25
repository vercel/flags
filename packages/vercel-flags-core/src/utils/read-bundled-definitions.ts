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
import type { BundledDefinitions } from '../types';

type DefinitionsJson = Record<string, BundledDefinitions>;

/**
 * Reads the local definitions that get bundled at build time (definitions.json).
 */
export async function readBundledDefinitions(
  id: string,
): Promise<
  | { definitions: BundledDefinitions; state: 'ok' }
  | { definitions: null; state: 'missing-file' | 'missing-entry' }
  | { definitions: null; state: 'unexpected-error'; error: unknown }
> {
  let stores: DefinitionsJson;
  try {
    stores = await import(
      /* webpackIgnore: true */
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
      return { definitions: null, state: 'missing-file' };
    }

    return { definitions: null, state: 'unexpected-error', error };
  }

  const entry = stores && Object.hasOwn(stores, id) ? stores[id] : null;
  if (!entry) return { definitions: null, state: 'missing-entry' };
  return { definitions: entry, state: 'ok' };
}
