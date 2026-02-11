// The @vercel/flags-definitions module is created at build time by Vercel CLI
// in node_modules/. This is a fallback mechanism used so the app can always
// fall back to a bundled version of the definitions, even if the flags network
// is degraded or unavailable.
//

import type { BundledDefinitions, BundledDefinitionsResult } from '../types';

/** In-memory cache of SDK key to its hashed value, so we don't re-hash repeatedly. */
const sdkKeyHashCache = new Map<string, Promise<string>>();

/** Computes a SHA-256 hex digest of the given SDK key. */
async function computeHash(sdkKey: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(sdkKey),
  );
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Returns a cached promise for the SHA-256 hash of the given SDK key. */
function hashSdkKey(sdkKey: string): Promise<string> {
  const cached = sdkKeyHashCache.get(sdkKey);
  if (cached) return cached;

  const promise = computeHash(sdkKey);
  sdkKeyHashCache.set(sdkKey, promise);
  return promise;
}

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

  // try plain sdk key first
  const entry = get(sdkKey);
  if (entry) return { definitions: entry, state: 'ok' };

  // try hashed key but catch any errors
  try {
    const hashedKey = await hashSdkKey(sdkKey);
    // try original key (older cli versions) and hashed key (newer cli versions)
    const hashedEntry = get(hashedKey);
    if (hashedEntry) return { definitions: hashedEntry, state: 'ok' };
  } catch (error) {
    return { definitions: null, state: 'unexpected-error', error };
  }

  return { definitions: null, state: 'missing-entry' };
}
