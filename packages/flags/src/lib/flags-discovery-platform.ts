/**
 * The `flags-keys-issuer` in Vercel KMS, which signs the tokens of the flags
 * discovery endpoint.
 *
 * TODO(flags-keys-issuer): replace the placeholder with the id of the issuer
 * once it exists. The placeholder is not a valid issuer, so no token verifies
 * against it and its keys are never loaded (fail closed).
 *
 * @internal
 */
export const VERCEL_FLAGS_DISCOVERY_ISSUER =
  'https://kms.vercel.com/TODO-flags-keys-issuer';

/**
 * The rules for tokens of the flags discovery endpoint which are signed by the
 * platform. They are part of the protocol.
 *
 * @internal
 */
export const FLAGS_DISCOVERY_POLICY = Object.freeze({
  algorithm: 'ES256',
  audience: 'vercel:flags-discovery',
  purpose: 'flags-discovery',
  version: 1,
  maxLifetimeSeconds: 300,
  clockToleranceSeconds: 5,
  maxTokenLength: 16_384,
});
