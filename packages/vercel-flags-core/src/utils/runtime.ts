/**
 * Detects the Bun runtime. Bun exposes a `Bun` global and `process.versions.bun`;
 * checking the global avoids depending on `process` being present.
 */
export function isBun(): boolean {
  return typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined';
}
