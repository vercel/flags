import { addEnv } from '../lib/vercel-platform';

// We're doing this dance so that the flags package is usable both in the SvelteKit environment
// as well as other environments that don't know about '$env/dynamic/private', such as Routing Middleware
let default_secret: string | undefined = process.env.FLAGS_SECRET;
let loaded: Promise<void> | undefined;

/**
 * Loads the environment of SvelteKit one time. During `vite dev`, the
 * variables of `.env.local` (e.g. from `vercel env pull`) are in `$env`, but
 * not in `process.env`.
 */
function loadEnv(): Promise<void> {
  loaded ??= Promise.all([loadSecret(), loadVercelEnv()]).then(() => {});
  return loaded;
}

async function loadSecret(): Promise<void> {
  try {
    // @ts-expect-error SvelteKit will know about this
    // use static instead of dynamic because only the latter is available during prerendering,
    // and in case it's not available through that it should be via process.env above.
    const env = await import('$env/static/private');
    default_secret ||= env.FLAGS_SECRET;
  } catch {
    // ignore, could happen when importing from an environment that doesn't know this import
  }
}

/**
 * Reads the variables of the Vercel project from the dynamic environment,
 * which is read at runtime: the static one puts the values of the build
 * (e.g. its `VERCEL_OIDC_TOKEN`) into the server bundle. Only the names which
 * `findVercelProject` reads are copied.
 */
async function loadVercelEnv(): Promise<void> {
  try {
    // @ts-expect-error SvelteKit will know about this
    const { env } = await import('$env/dynamic/private');
    addEnv({
      VERCEL_PROJECT_ID: env.VERCEL_PROJECT_ID,
      VERCEL_TARGET_ENV: env.VERCEL_TARGET_ENV,
      VERCEL_ENV: env.VERCEL_ENV,
      VERCEL_OIDC_TOKEN: env.VERCEL_OIDC_TOKEN,
    });
  } catch {
    // ignore: not SvelteKit, or prerendering, where the dynamic environment
    // can not be read. `process.env` has the variables then.
  }
}

export async function getSecret(secret?: string): Promise<string | undefined> {
  await loadEnv();
  return secret || default_secret;
}

export async function tryGetSecret(secret?: string): Promise<string> {
  secret = await getSecret(secret);

  if (!secret) {
    throw new Error(
      'flags: No secret provided. Set an environment variable FLAGS_SECRET or provide a secret to the function.',
    );
  }

  return secret;
}
