// The definitions.json file is overwritten at build time by the app,
// which then becomes part of the actual app's bundle. This is a fallback
// mechanism used so the app can always fall back to a bundled version of
// the definitions, even if the flags network is degraded or unavailable.
//
// At build time of the actual app the definitions.json file is overwritten
// using the "vercel-flags prepare" script.
//
// At build time of this package we also copy over a placeholder file,
// such that any app not using the "vercel-flags prepare" script has
// imports an empty object instead.
//
// By default we provide a "definitions.json" file that contains "null", which
// allows us to determine whether the "vercel-flags prepare" script ran.
// If the value is "null" the script did not run. If the value is an empty
// object or an object with keys the script definitely ran.
//
// @ts-expect-error this file exists in the final bundle
import definitions from '@vercel/flags-core/dist/definitions.json' with {
  type: 'json',
};
import type { BundledDefinitions } from '../types';

/**
 * Reads the local edge config that gets bundled at build time (definitions.json).
 */
export async function readBundledDefinitions(
  id: string,
): Promise<BundledDefinitions | null> {
  try {
    // "vercel-flags prepare" script did not run
    if (definitions === null) return null;
    return (definitions[id] as BundledDefinitions | undefined) ?? null;
  } catch (error) {
    console.error(
      '@vercel/flags-core: Failed to read bundled definitions:',
      error,
    );
    return null;
  }
}
