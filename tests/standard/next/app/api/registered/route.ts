import { runtime } from 'flags/runtime';

// The names of the providers of the registered sources, after the import
// of a 'use flags' module
export async function GET() {
  await import('../../../lazy-flags');
  const { sources } = runtime as unknown as {
    sources: ReadonlySet<{ provider: { metadata: { name: string } } }>;
  };
  return Response.json({
    providers: [...sources].map((c) => c.provider.metadata.name),
  });
}
