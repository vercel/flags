// TanStack Start runs on the server through Nitro/Vite, so the secret is
// available via `process.env`. We keep this in its own module to mirror the
// other framework adapters and to make it easy to swap out later.
export async function tryGetSecret(secret?: string): Promise<string> {
  secret = secret || process.env.FLAGS_SECRET;

  if (!secret) {
    throw new Error(
      'flags: No secret provided. Set an environment variable FLAGS_SECRET or provide a secret to the function.',
    );
  }

  return secret;
}
