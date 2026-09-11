export const VERSION_HEADER = 'x-vercel-edge-config-versions';
export const FALLBACK_VERSION_HEADER = 'edge-config-versions';

export type ConfigVersionLookup =
  | { status: 'found'; version: number }
  | { status: 'not-found' }
  | { status: 'invalid' };

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

/** Selects the first valid exact-key match from a semicolon-separated map. */
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

    const version = parseConfigVersion(
      segment.slice(separatorIndex + 1).trim(),
    );
    if (version !== undefined) return { status: 'found', version };
    match = { status: 'invalid' };
  }

  return match ?? { status: 'not-found' };
}
