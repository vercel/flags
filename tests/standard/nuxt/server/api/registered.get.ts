import { runtime } from 'flags';

// The names of the providers of the registered connections, after the import
// of a 'use flags' module
export default defineEventHandler(async () => {
  await import('../../lib/lazy-flags');
  const { connections } = runtime as unknown as {
    connections: ReadonlySet<{ provider: { metadata: { name: string } } }>;
  };
  return { providers: [...connections].map((c) => c.provider.metadata.name) };
});
