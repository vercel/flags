/**
 * Parser for the `x-vercel-edge-config-versions` request header.
 *
 * Vercel attaches this header to incoming requests to describe which config
 * version the request was routed to. It holds a semicolon-separated map of
 * store name to version, where the version is a millisecond timestamp:
 *
 * ```
 * x-vercel-edge-config-versions: flags_prj_123=1758000000000;ecfg_abc=1757000000000
 * ```
 *
 * Flag definitions of a Vercel project are stored under `flags_<projectId>`.
 * Only an exact key match counts — no prefix, suffix or substring matching —
 * so an unrelated store can never be mistaken for the project's flags.
 */

/** Name of the request header carrying the routed config versions. */
export const EDGE_CONFIG_VERSIONS_HEADER = 'x-vercel-edge-config-versions';

/** Result of looking up a single entry of the versions map. */
export type ConfigVersionLookup =
  /** The key was present exactly once with a usable version. */
  | { status: 'found'; version: number }
  /** The key was not present in the map. */
  | { status: 'not-found' }
  /** The key was present but its version is malformed or unsafe. */
  | { status: 'invalid' }
  /** The key was present more than once, so no version can be trusted. */
  | { status: 'duplicate' };

const DIGITS = /^\d+$/;

/**
 * Derives the versions-map key holding the flag definitions of a project.
 */
export function flagsConfigVersionKey(projectId: string): string {
  return `flags_${projectId}`;
}

/**
 * Parses a config version into a timestamp that is safe to compare.
 *
 * Only non-negative integers within the safe integer range are accepted.
 * Everything else (empty strings, signs, fractions, exponents, hex, `NaN`,
 * `Infinity`, values beyond `Number.MAX_SAFE_INTEGER`) is rejected, since a
 * timestamp that cannot be compared exactly must not drive any decision.
 *
 * The regex is anchored and matches a single character class, so it runs in
 * linear time regardless of input length.
 */
export function parseConfigVersion(value: string): number | undefined {
  if (!DIGITS.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

/**
 * Selects the entry with the exact `key` from a versions map header value.
 *
 * Surrounding whitespace of entries, keys and values is ignored (HTTP list
 * values may be padded), empty segments are skipped, and entries without a
 * `=` separator are ignored. Duplicate keys are reported instead of resolved,
 * because picking either one would be a guess.
 */
export function selectConfigVersion(
  headerValue: string | undefined,
  key: string,
): ConfigVersionLookup {
  if (!headerValue || !key) return { status: 'not-found' };

  let match: ConfigVersionLookup | undefined;

  for (const segment of headerValue.split(';')) {
    const separatorIndex = segment.indexOf('=');
    if (separatorIndex === -1) continue;
    if (segment.slice(0, separatorIndex).trim() !== key) continue;

    // A key that shows up twice makes the whole lookup ambiguous.
    if (match) return { status: 'duplicate' };

    const version = parseConfigVersion(
      segment.slice(separatorIndex + 1).trim(),
    );
    match =
      version === undefined
        ? { status: 'invalid' }
        : { status: 'found', version };
  }

  return match ?? { status: 'not-found' };
}
