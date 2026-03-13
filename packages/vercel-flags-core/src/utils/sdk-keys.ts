/**
 * Parses sdk keys from connection strings with the following format:
 * `flags:edgeConfigId=ecfg_abcd&edgeConfigToken=xxx&sdkKey=xxx`
 */
export function parseSdkKeyFromFlagsConnectionString(
  text: string,
): string | null {
  if (text.startsWith('vf_')) return text;

  try {
    if (!text.startsWith('flags:')) return null;
    const params = new URLSearchParams(text.slice(6));
    return params.get('sdkKey');
  } catch {
    // no-op
  }

  return null;
}
