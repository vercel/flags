/** Internal diagnostics only: never pass credentials, payloads, or raw errors. */
export type DebugLogger = (
  event: string,
  details?: () => Record<string, string | number | boolean | undefined>,
) => void;

export const noopDebug: DebugLogger = () => {};
let nextClientId = 0;

/** Match the existing ingest DEBUG switch, captured when a client is created. */
export function createDebugLogger(): DebugLogger {
  const clientId = ++nextClientId;
  if (!process.env.DEBUG?.includes('@vercel/flags-core')) return noopDebug;

  return (event, details) => {
    // Diagnostics must not affect initialization, reads, or background work.
    try {
      console.debug('@vercel/flags-core', { clientId, event, ...details?.() });
    } catch {
      // Console implementations may throw (for example, a closed output stream).
    }
  };
}
