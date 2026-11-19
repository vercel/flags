import { json } from '@sveltejs/kit';
import { runtime } from 'flags';

// The names of the providers of the registered sources, after the import
// of a 'use flags' module
export async function GET() {
  await import('../../../lib/lazy-flags');
  const { sources } = runtime as unknown as {
    sources: ReadonlySet<{ provider: { metadata: { name: string } } }>;
  };
  return json({
    providers: [...sources].map((c) => c.provider.metadata.name),
  });
}
