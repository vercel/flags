/**
 * The route of the manifest of flags for Next.js, e.g. for Flags Explorer:
 *
 * ```ts
 * // app/.well-known/flags/manifest.json/route.ts
 * export { GET } from 'flags/next/manifest';
 * ```
 *
 * In development, it returns the manifest. In production, it returns 404:
 * the manifest is a file of the build (`flags-manifest.json` in `distDir`),
 * not a public endpoint.
 */
import { createManifest, type FlagsManifest } from '../manifest';

interface FlagsModuleImport {
  readonly id: string;
  load(): Promise<Record<string, unknown>>;
}

// The loader of withFlags replaces the list with an import of each module
// with the 'use flags' directive. Without withFlags, the list is empty.
const modules: readonly FlagsModuleImport[] = /* flags:use-flags-modules */ [];

/**
 * Imports the modules with `'use flags'`, and creates the manifest from
 * their exports.
 *
 * @internal
 */
export async function loadManifest(): Promise<FlagsManifest> {
  return createManifest(
    await Promise.all(
      modules.map(async (module) => ({
        id: module.id,
        exports: { ...(await module.load()) },
      })),
    ),
  );
}

export async function GET(): Promise<Response> {
  // The build of withFlags sets it, to write the manifest into the build
  const forBuild = process.env.__FLAGS_WRITE_MANIFEST === '1';
  if (process.env.NODE_ENV === 'production' && !forBuild) {
    return new Response(null, { status: 404 });
  }
  return Response.json(await loadManifest(), {
    headers: { 'cache-control': 'no-store' },
  });
}
