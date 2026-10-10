/**
 * The default provider for the Flags SDK (`flags`).
 *
 * The Flags SDK imports `flags/default-provider` for flags without a
 * connection. A framework or a platform can replace that module with this one
 * through a bundler alias, so that these flags use Vercel Flags without a
 * request for each evaluation.
 *
 * The Flags SDK calls `createDefaultProvider` one time for each process, so
 * this module needs no singleton.
 *
 * There is also default-provider.next-js.ts. If you update this file,
 * please update that file as well.
 */

import { VercelProvider } from './openfeature.default';

export function createDefaultProvider(): InstanceType<typeof VercelProvider> {
  return new VercelProvider();
}
