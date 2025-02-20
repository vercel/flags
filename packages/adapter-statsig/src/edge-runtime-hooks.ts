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
    edgeConfigClient: createClient(options.edgeConfigConnectionString),
  });
}

/**
 * Edge runtime and React Server Components do not support timers outside of a request context.
 *
 * Statsig syncs config specs outside of the request context,
 * so we will support it in triggering config spec synchronization in this case.
 */
export const createEdgeRuntimeIntervalHandler = (): null | (() => void) => {
  const timerInterval = 10_000;
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
