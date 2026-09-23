/** Internal diagnostics only: never pass credentials, payloads, or raw errors. */
export function debug(
  event: string,
  details?: () => Record<string, string | number | boolean | undefined>,
): void {
  if (!process.env.DEBUG?.includes('@vercel/flags-core')) return;

  // Diagnostics must not affect initialization, reads, or background work.
  try {
    console.debug('@vercel/flags-core', { event, ...details?.() });
  } catch {
    // Console implementations may throw (for example, a closed output stream).
  }
}
