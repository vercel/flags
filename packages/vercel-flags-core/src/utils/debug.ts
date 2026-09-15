type DebugSource =
  | 'controller'
  | 'stream-source'
  | 'header-source'
  | 'bundled-source';
type DebugDetails = Record<string, string | number | boolean | undefined>;

/** Keep debug payloads limited to operational metadata, never credentials or flags. */
export function debugLog(
  source: DebugSource,
  message: string,
  details: DebugDetails = {},
): void {
  if (!process.env.DEBUG?.includes('@vercel/flags-core')) return;
  console.log(`@vercel/flags-core [${source}] ${message}`, details);
}
