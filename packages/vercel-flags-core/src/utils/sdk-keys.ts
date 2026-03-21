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

/**
 * Parses sdk keys from connection strings with the following format:
 * `flags:edgeConfigId=ecfg_abcd&edgeConfigToken=xxx&sdkKey=xxx`
 */
export function parseSdkKeyFromFlagsConnectionString(
  text: string,
): string | null {
  if (SDK_KEY_REGEX.test(text)) return text;

  try {
    if (!text.startsWith('flags:')) return null;
    const params = new URLSearchParams(text.slice(6));
    const sdkKey = params.get('sdkKey');
    if (sdkKey && SDK_KEY_REGEX.test(sdkKey)) return sdkKey;
  } catch {
    // no-op
  }

  return null;
}
