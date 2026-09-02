import { getRequestContext } from './request-context';

/**
 * Request header the Vercel Edge Network attaches to incoming requests. It
 * lists the last known update timestamp of every config attached to the
 * current deployment as semicolon-separated `<id>=<updatedAt>` pairs:
 *
 * ```
 * ecfg_abc=1726434395818;flags_prj_123=1726434400000
 * ```
 *
 * The entry describing a project's flag configuration is keyed
 * `flags_<projectId>` and its value is a millisecond epoch timestamp,
 * comparable to a datafile's `configUpdatedAt`.
 *
 * The header is not guaranteed to be present, and individual values are not
 * guaranteed to be numeric, so every read must tolerate its absence.
 */
export const EDGE_CONFIG_VERSIONS_HEADER = 'x-vercel-edge-config-versions';

/**
 * The `x-vercel-edge-config-versions` key holding the flag configuration
 * version of the given project.
 */
export function flagsConfigVersionKey(projectId: string): string {
  return `flags_${projectId}`;
}

/**
 * Reads the `flags_<projectId>` entry from an `x-vercel-edge-config-versions`
 * header value.
 *
 * Returns undefined when the header is missing, carries no entry for the
 * project, or the entry's value is not a positive timestamp.
 */
export function parseFlagsConfigVersion(
  headerValue: string | undefined,
  projectId: string,
): number | undefined {
  if (!headerValue) return undefined;

  const key = flagsConfigVersionKey(projectId);

  for (const entry of headerValue.split(';')) {
    const separatorIndex = entry.indexOf('=');
    if (separatorIndex === -1) continue;
    if (entry.slice(0, separatorIndex).trim() !== key) continue;

    const rawValue = entry.slice(separatorIndex + 1).trim();
    if (rawValue === '') return undefined;

    const value = Number(rawValue);
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }

  return undefined;
}

/**
 * Reads the flag configuration version the Edge Network advertises for the
 * given project on the current request.
 *
 * Only the resulting timestamp escapes this function — neither the request
 * context nor its headers are retained anywhere, so module-scoped callers
 * cannot keep a request alive.
 */
export function readFlagsConfigVersion(projectId: string): number | undefined {
  const { headers } = getRequestContext();
  if (!headers) return undefined;
  return parseFlagsConfigVersion(
    headers[EDGE_CONFIG_VERSIONS_HEADER],
    projectId,
  );
}
