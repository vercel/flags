export const VERSION_HEADER = 'x-vercel-edge-config-versions';
export const FALLBACK_VERSION_HEADER = 'edge-config-versions';

export type ConfigVersionLookup =
  | { status: 'found'; version: number }
  | { status: 'not-found' }
  | { status: 'invalid' }
  | { status: 'duplicate' };

const DIGITS = /^\d+$/;

export function flagsConfigVersionKey(projectId: string): string {
  return `flags_${projectId}`;
}

/** Only non-negative safe integers can be compared reliably as timestamps. */
export function parseConfigVersion(value: string): number | undefined {
  if (!DIGITS.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

/** Selects an exact key from a semicolon-separated map; duplicates are ambiguous. */
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
