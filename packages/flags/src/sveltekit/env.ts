// We're doing this dance so that the flags package is usable both in the SvelteKit environment
// as well as other environments that don't know about '$env/dynamic/private', such as Edge Middleware
let default_secret: string | undefined = process.env.FLAGS_SECRET;

export async function tryGetSecret(secret?: string): Promise<string> {
  if (!default_secret) {
    try {
      // @ts-expect-error SvelteKit will know about this
      const env = await import('$env/dynamic/private');
      default_secret = env.env.FLAGS_SECRET;
    } catch (e) {
      // ignore, could happen when importing from an environment that doesn't know this import
    }
  }

  secret = secret || default_secret;

  if (!secret) {
    throw new Error(
      'flags: No secret provided. Set an environment variable FLAGS_SECRET or provide a secret to the function.',
    );
  }

  return secret;
}
