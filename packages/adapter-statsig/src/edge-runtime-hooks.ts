import Statsig from 'statsig-node-lite';

declare global {
  var EdgeRuntime: string | undefined;
}

export const isEdgeRuntime = (): boolean => {
  return EdgeRuntime !== undefined;
};

/**
 * The Edge Config Data Adapter is an optional peer dependency that allows
 * the Statsig SDK to retrieve its data from Edge Config instead of over the network.
 */
export async function createEdgeConfigDataAdapter(options: {
  edgeConfigItemKey: string;
  edgeConfigConnectionString: string;
}) {
  // Edge Config adapter requires `@vercel/edge-config` and `statsig-node-vercel`
  // Since it is a peer dependency, we will import it dynamically
  const { EdgeConfigDataAdapter } = await import('statsig-node-vercel');
  const { createClient } = await import('@vercel/edge-config');
  return new EdgeConfigDataAdapter({
    edgeConfigItemKey: options.edgeConfigItemKey,
    edgeConfigClient: createClient(options.edgeConfigConnectionString, {
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
export const createSyncingHandler = (): null | (() => void) => {
  // Syncing both in Edge Runtime and Node.js for now, as the sync is otherwise
  // not working during local development.
  //
  // This needs to be fixed in statsig-node-lite in the future.
  //
  // Ideally the Statsig SDK would not sync at all and instead always read from Edge Config,
  // this would provide two benefits:
  // - changes would propagate immediately instead of being cached for 5s or 10s
  // - the broken syncing due to issues in Date.now in Edge Runtime would be irrelevant
  //
  // if (typeof EdgeRuntime === 'undefined') return null;

  const timerInterval = 5_000;
  let isSyncingConfigSpecs = false;
  let nextConfigSpecSyncTime = Date.now() + timerInterval;
  return (): void => {
    if (Date.now() >= nextConfigSpecSyncTime && !isSyncingConfigSpecs) {
      try {
        isSyncingConfigSpecs = true;
        const sync = Statsig.syncConfigSpecs().finally(() => {
          isSyncingConfigSpecs = false;
          nextConfigSpecSyncTime = Date.now() + timerInterval;
        });
        import('@vercel/functions').then(({ waitUntil }) => {
          waitUntil(sync);
        });
      } catch (e) {
        // continue
      }
    }
  };
};
