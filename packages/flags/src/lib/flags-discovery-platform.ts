/**
 * The `flags-keys-issuer` in Vercel KMS, which signs the tokens of the flags
 * discovery endpoint.
 *
 * @internal
 */
export const VERCEL_FLAGS_DISCOVERY_ISSUER =
  'https://kms.vercel.com/d0efbb30-566d-48b6-b173-0062e54ec49c';

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
