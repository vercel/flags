/**
 * Computes a short, non-cryptographic ETag for a string body using FNV-1a hashing.
 *
 * Used to support conditional requests (If-None-Match / 304) on endpoints that
 * must always return certain headers, since we generate the 304 ourselves
 * instead of relying on an upstream cache to do it (which may drop headers).
 */
export function computeEtag(body: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < body.length; i++) {
    hash ^= body.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `"${(hash >>> 0).toString(36)}-${body.length}"`;
}
