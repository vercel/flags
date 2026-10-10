/**
 * A value which JSON can represent.
 */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Why the SDK ignored an override token. The SDK logs the reason, but never
 * the contents of the token.
 */
export type OverrideRejection =
  | 'malformed-token'
  | 'token-too-large'
  | 'missing-secret'
  | 'invalid-secret'
  | 'invalid-jwe'
  | 'untrusted-jws'
  | 'unsupported-algorithm'
  | 'invalid-signature'
  | 'expired-token'
  | 'invalid-claims'
  | 'wrong-scope'
  | 'unknown-key';
