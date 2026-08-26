import Statsig from 'statsig-node-lite';

declare global {
  var EdgeRuntime: string | undefined;
}

export const isEdgeRuntime = (): boolean => {
  return EdgeRuntime !== undefined;
};

/**
 * The Global Config Data Adapter is an optional peer dependency that allows
 * the Statsig SDK to retrieve its data from Global Config instead of over the network.
 */
export async function createGlobalConfigDataAdapter(options: {
  globalConfigItemKey: string;
  globalConfigConnectionString: string;
}) {
  // Global Config adapter requires `@vercel/global-config` and `statsig-node-vercel`
  // Since it is a peer dependency, we will import it dynamically
  const { EdgeConfigDataAdapter: GlobalConfigDataAdapter } = await import(
    'statsig-node-vercel'
  );
  const { createClient } = await import('@vercel/global-config');
  return new GlobalConfigDataAdapter({
    edgeConfigItemKey: options.globalConfigItemKey,
    edgeConfigClient: createClient(options.globalConfigConnectionString, {
      // We disable the development cache as Statsig caches for 10 seconds internally,
      // and we want to avoid situations where Statsig tries to read the latest value,
      // but hits the development cache and then caches the outdated value for another 10 seconds,
      // as this would lead to the developer having to wait 20 seconds to see the latest value.
      disableDevelopmentCache: true,
    }),
  });
}

/**
 * Edge runtime does not support timers outside of a request context.
 *
 * Statsig syncs config specs outside of the request context,
 * so we will support it in triggering config spec synchronization in this case.
 */
export const createSyncingHandler = (
  minSyncDelayMs: number,
): null | (() => void) => {
  // Syncing both in Edge Runtime and Node.js for now, as the sync is otherwise
  // not working during local development.
  //
  // This needs to be fixed in statsig-node-lite in the future.
  //
  // Ideally the Statsig SDK would not sync at all and instead always read from Global Config,
  // this would provide two benefits:
  // - changes would propagate immediately instead of being cached for 5s or 10s
  // - the broken syncing due to issues in Date.now in Edge Runtime would be irrelevant
  //
  // if (typeof EdgeRuntime === 'undefined') return null;
  let isSyncingConfigSpecs = false;
  let nextConfigSpecSyncTime = Date.now() + minSyncDelayMs;
  return (): void => {
    if (Date.now() >= nextConfigSpecSyncTime && !isSyncingConfigSpecs) {
      try {
        isSyncingConfigSpecs = true;
        const sync = Statsig.syncConfigSpecs().finally(() => {
          isSyncingConfigSpecs = false;
          nextConfigSpecSyncTime = Date.now() + minSyncDelayMs;
        });
        import('@vercel/functions').then(({ waitUntil }) => {
          waitUntil(sync);
        });
      } catch {
        // continue
      }
    }
  };
};
