/**
 * The public key set for the flag values of the Flags SDK. The SDK encrypts
 * the values of a page with this key (ECDH-ES with P-256), and only the
 * holder of the private key can decrypt them.
 *
 * TEMPORARY: flags-sdk.dev publishes the key until Vercel publishes its own.
 * The key comes from the environment variable FLAG_VALUES_PUBLIC_KEY, a
 * JWK. The private key is in FLAG_VALUES_PRIVATE_KEY, for the intake.
 */

/** The members of a public EC key. Other members are never published. */
const publicMembers = ['kty', 'crv', 'x', 'y', 'kid', 'use', 'alg'] as const;

export type PublicJwk = Partial<Record<(typeof publicMembers)[number], string>>;

/**
 * Returns the public key of the environment variable, without private
 * members. Returns `undefined` if the variable is missing or not valid.
 */
export const readPublicKey = (
  value: string | undefined,
): PublicJwk | undefined => {
  if (!value) {
    return undefined;
  }
  let jwk: unknown;
  try {
    jwk = JSON.parse(value);
  } catch {
    return undefined;
  }
  if (typeof jwk !== 'object' || jwk === null) {
    return undefined;
  }
  const source = jwk as Record<string, unknown>;
  if (
    source.kty !== 'EC' ||
    source.crv !== 'P-256' ||
    typeof source.kid !== 'string'
  ) {
    return undefined;
  }
  const key: PublicJwk = {};
  for (const member of publicMembers) {
    const memberValue = source[member];
    if (typeof memberValue === 'string') {
      key[member] = memberValue;
    }
  }
  return { ...key, use: 'enc', alg: 'ECDH-ES' };
};

export const flagValuesJwksResponse = (value: string | undefined) => {
  const key = readPublicKey(value);
  if (!key) {
    return Response.json(
      { error: { code: 'not_configured', message: 'No public key.' } },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
  return Response.json(
    { keys: [key] },
    { headers: { 'cache-control': 'public, max-age=300' } },
  );
};
