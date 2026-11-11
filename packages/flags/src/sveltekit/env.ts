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
  loaded ??= (async () => {
    try {
      // @ts-expect-error SvelteKit will know about this
      // use static instead of dynamic because only the latter is available during prerendering,
      // and in case it's not available through that it should be via process.env above.
      const env = await import('$env/static/private');
      default_secret ||= env.FLAGS_SECRET;
      addEnv({ ...env });
    } catch {
      // ignore, could happen when importing from an environment that doesn't know this import
    }
  })();
  return loaded;
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
