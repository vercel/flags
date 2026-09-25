/**
 * Regex to match valid Vercel Flags SDK keys.
 * SDK keys must follow the format: vf_server_* or vf_client_*
 * This avoids false positives with third-party identifiers that happen
 * to start with 'vf_' (e.g., Stripe identity flow IDs like 'vf_1PyH...').
 */
const SDK_KEY_REGEX = /^vf_(?:server|client)_/;

/**
 * Checks if a string is a valid Vercel Flags SDK key.
 */
export function isValidSdkKey(value: string): boolean {
  return SDK_KEY_REGEX.test(value);
}

export type FlagsConnectionString = {
  sdkKey: string | null;
  projectId: string | null;
};

/**
 * Parses connection strings such as
 * `flags:edgeConfigId=ecfg_abcd&edgeConfigToken=xxx&sdkKey=vf_server_xxx` or
 * `flags:projectId=prj_xxx`. A bare SDK key is accepted as well.
 * The sdkKey is returned as written; validate it with `isValidSdkKey`.
 * Returns null when the value is neither.
 */
export function parseFlagsConnectionString(
  text: string,
): FlagsConnectionString | null {
  if (SDK_KEY_REGEX.test(text)) return { sdkKey: text, projectId: null };
  if (!text.startsWith('flags:')) return null;

  try {
    const params = new URLSearchParams(text.slice(6));
    return {
      sdkKey: params.get('sdkKey') || null,
      projectId: params.get('projectId') || null,
    };
  } catch {
    return null;
  }
}

/**
 * Parses sdk keys from connection strings with the following format:
 * `flags:edgeConfigId=ecfg_abcd&edgeConfigToken=xxx&sdkKey=xxx`
 */
export function parseSdkKeyFromFlagsConnectionString(
  text: string,
): string | null {
  const sdkKey = parseFlagsConnectionString(text)?.sdkKey;
  return sdkKey && SDK_KEY_REGEX.test(sdkKey) ? sdkKey : null;
}
