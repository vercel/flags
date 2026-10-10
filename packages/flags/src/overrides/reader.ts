import { logger } from '../logger';
import type { ReadonlyRequestCookies } from '../types';
import {
  decodeSecret,
  decryptWithKey,
  type FlagOverrides,
} from './shared-secret';
import type { JsonValue, OverrideRejection } from './types';
import {
  createVercelVerifier,
  OverridesError,
  type VercelOverridesOptions,
  type VerifyResult,
} from './vercel';

export interface OverridesOptions {
  /**
   * The shared secret for override tokens which tests, CI or the Vercel
   * Toolbar create with `FLAGS_SECRET`. The default is the environment
   * variable `FLAGS_SECRET`. Use `false` to accept no such tokens.
   */
  readonly secret?: string | false;
  /**
   * Accepts override tokens which Vercel signs. The default is `true` on
   * Vercel or with a linked project (when `VERCEL` or `VERCEL_OIDC_TOKEN` is
   * set) without a shared secret, otherwise `false`. An object sets options
   * and accepts the tokens.
   */
  readonly vercel?: boolean | VercelOverridesOptions;
}

/**
 * The cookies which can contain an override token, in the order in which the
 * SDK reads them. `vercel-flag-overrides` is the cookie of v4 of the SDK.
 */
const OVERRIDES_COOKIES = ['flag-overrides', 'vercel-flag-overrides'];

const MAX_TOKEN_LENGTH = 16_384;

export type OverridesReader = (
  cookies: ReadonlyRequestCookies | undefined,
) => Promise<ReadonlyMap<string, JsonValue>>;

type Verify = (token: string) => Promise<VerifyResult>;

const noOverrides: ReadonlyMap<string, JsonValue> = new Map();

/**
 * Creates the function which reads the overrides of a request. The trust
 * comes only from the options and the environment, never from the token.
 *
 * Explicit options are validated at once. The defaults, which come from the
 * environment, are read when a token needs them, because the environment can
 * change until then.
 *
 * @internal
 */
export function createOverridesReader(
  options: OverridesOptions = {},
): OverridesReader {
  const explicitKey =
    typeof options.secret === 'string'
      ? decodeSecret(options.secret)
      : undefined;
  let explicitVercel: Verify | undefined;
  if (typeof options.vercel === 'object') {
    explicitVercel = createVercelVerifier(options.vercel);
  } else if (options.vercel === true) {
    explicitVercel = createVercelVerifier();
  }
  let defaultVercel: Verify | undefined;

  function sharedSecret():
    | { readonly key: Uint8Array }
    | { readonly rejection: OverrideRejection } {
    if (explicitKey) return { key: explicitKey };
    const secret = options.secret === false ? '' : process.env.FLAGS_SECRET;
    if (!secret) return { rejection: 'missing-secret' };
    try {
      return { key: decodeSecret(secret) };
    } catch {
      return { rejection: 'invalid-secret' };
    }
  }

  function vercel(): Verify | undefined {
    if (explicitVercel || options.vercel !== undefined) return explicitVercel;
    // The default: on Vercel or with a linked project (VERCEL_OIDC_TOKEN of
    // vercel env pull), unless a shared secret is used
    const hasSecret = explicitKey !== undefined || !!process.env.FLAGS_SECRET;
    const onVercel = !!process.env.VERCEL || !!process.env.VERCEL_OIDC_TOKEN;
    if (!onVercel || hasSecret) return undefined;
    defaultVercel ??= createVercelVerifier();
    return defaultVercel;
  }

  async function readToken(token: string): Promise<VerifyResult> {
    if (token.length > MAX_TOKEN_LENGTH) {
      return { rejection: 'token-too-large' };
    }
    // The format only selects the method. Each method verifies the token
    // completely, and an invalid token never goes to a different method.
    const parts = token.split('.').length;
    if (parts === 3) {
      const verify = vercel();
      return verify ? verify(token) : { rejection: 'untrusted-jws' };
    }
    if (parts === 5) {
      const key = sharedSecret();
      if ('rejection' in key) return key;
      const overrides = await decryptWithKey(token, key.key);
      return overrides ? { overrides } : { rejection: 'invalid-jwe' };
    }
    return { rejection: 'malformed-token' };
  }

  return async (cookies) => {
    const token = findToken(cookies);
    if (!token) return noOverrides;

    let result: VerifyResult;
    try {
      result = await readToken(token);
    } catch (error) {
      // The SDK can not verify tokens at all, e.g. the keys can not be loaded
      if (error instanceof OverridesError) throw error;
      result = { rejection: 'malformed-token' };
    }
    if ('rejection' in result) {
      // Never log the token: it can contain information about the user
      logger.warn(
        `flags: The override cookie was ignored. Reason: ${result.rejection}.`,
      );
      return noOverrides;
    }
    return toMap(result.overrides);
  };
}

function findToken(cookies: ReadonlyRequestCookies | undefined) {
  if (!cookies) return undefined;
  for (const name of OVERRIDES_COOKIES) {
    const value = cookies.get(name)?.value;
    if (value) return value;
  }
  return undefined;
}

function toMap(overrides: FlagOverrides): ReadonlyMap<string, JsonValue> {
  return new Map(
    Object.entries(overrides).filter(([, value]) => value !== undefined),
  );
}
