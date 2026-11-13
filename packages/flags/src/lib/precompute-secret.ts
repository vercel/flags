import { base64url } from 'jose';
import { readEnv } from './vercel-platform';

// Binds the derived key to precompute, so that it is not the key of another
// feature which uses `VERCEL_DEPLOYMENT_KEY`. Part of the format: a change
// makes the codes of a deployment invalid.
const INFO = 'flags:precompute:v1';

// `flags-development-precompute-key` as base64url. It is public: it only
// makes precompute work in local development without any setup.
const DEVELOPMENT_SECRET = 'ZmxhZ3MtZGV2ZWxvcG1lbnQtcHJlY29tcHV0ZS1rZXk';

let cache: { deploymentKey: string; secret: Promise<string> } | undefined;

/**
 * The secret of precompute which Vercel provides: a key derived from
 * `VERCEL_DEPLOYMENT_KEY`, which Vercel sets for the build and for the
 * runtime of a deployment. Returns `undefined` when the variable is missing.
 *
 * Each deployment has its own key. That is enough, because a code is only
 * used inside one deployment: the build and the middleware create it, and
 * the pages of the same deployment read it.
 *
 * @internal
 */
export function deploymentPrecomputeSecret(): Promise<string | undefined> {
  const deploymentKey = readEnv('VERCEL_DEPLOYMENT_KEY');
  if (!deploymentKey) return Promise.resolve(undefined);
  if (cache?.deploymentKey !== deploymentKey) {
    cache = { deploymentKey, secret: derive(deploymentKey) };
  }
  return cache.secret;
}

/**
 * HKDF with SHA-256 from Web Crypto, so that it works in the Edge runtime.
 * The deployment key is used as bytes of text: its encoding is not checked,
 * because a user can set their own value.
 */
async function derive(deploymentKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(deploymentKey),
    'HKDF',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32),
      info: encoder.encode(INFO),
    },
    key,
    256,
  );
  return base64url.encode(new Uint8Array(bits));
}

/**
 * The secret of precompute. The first of these which is set:
 *
 * 1. `secret`, which the caller passed
 * 2. `FLAGS_PRECOMPUTE_SECRET`
 * 3. `FLAGS_SECRET`
 * 4. the secret of the deployment, see `deploymentPrecomputeSecret`
 * 5. a fixed secret, when `NODE_ENV` is `development`
 *
 * A secret of the user is before the secret of the deployment, so that the
 * build and the runtime agree when only one of them has the deployment key
 * (e.g. a build with `vercel build`). Throws `message` when there is none.
 *
 * The fixed secret is for `next dev` and `vite dev`, which have no deployment
 * key. A local production build (e.g. `next build && next start`) has none.
 *
 * @internal
 */
export async function precomputeSecretOrThrow(
  secret: string | undefined,
  message: string,
): Promise<string> {
  const resolved =
    secret ||
    readEnv('FLAGS_PRECOMPUTE_SECRET') ||
    readEnv('FLAGS_SECRET') ||
    (await deploymentPrecomputeSecret()) ||
    (readEnv('NODE_ENV') === 'development' ? DEVELOPMENT_SECRET : undefined);
  if (!resolved) throw new Error(message);
  return resolved;
}
