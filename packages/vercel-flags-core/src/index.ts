import { createClient as createEdgeConfigClient } from '@vercel/edge-config';
import { createClient, type FlagsClient } from './client';
import { EdgeConfigDataSource } from './data-source/edge-config-data-source';
import { InMemoryDataSource } from './data-source/in-memory-data-source';
import type { ConnectionOptions } from './types';

export {
  createClient,
  type FlagsClient,
} from './client';
export { EdgeConfigDataSource, InMemoryDataSource };
export { store } from './store';
export { ResolutionReason as Reason } from './types';

let defaultFlagsClient: FlagsClient | null = null;

// TODO this should possibly be a generic parser for the URL, which
// can be used with sources other than Edge Config at some point
export function parseFlagsConnectionString(
  connectionString: string,
): ConnectionOptions {
  const errorMessage = 'flags: Invalid connection string';

  try {
    const params = new URLSearchParams(connectionString.slice(6));
    const edgeConfigId = params.get('edgeConfigId');
    const edgeConfigToken = params.get('edgeConfigToken');
    const projectId = params.get('projectId');
    if (!edgeConfigId || !edgeConfigToken || !projectId) {
      throw new Error(errorMessage);
    }

    return {
      edgeConfigId,
      edgeConfigToken,
      projectId,
      edgeConfigItemKey: params.get('edgeConfigItemKey'),
      env: params.get('env'),
    };
  } catch {
    throw new Error(errorMessage);
  }
}

/**
 * Internal function for testing purposes
 */
export function resetDefaultFlagsClient() {
  defaultFlagsClient = null;
}

export function createClientFromConnectionString(connectionString: string) {
  if (!connectionString) {
    throw new Error('flags: Missing connection string');
  }

  const connectionOptions = parseFlagsConnectionString(connectionString);
  const edgeConfigItemKey = connectionOptions.edgeConfigItemKey || 'flags';

  if (!connectionOptions.edgeConfigId || !connectionOptions.edgeConfigToken) {
    throw new Error('flags: Missing edge config connection information');
  }

  // TODO use latest connection string format
  // const edgeConfigConnectionString = `edge-config:id=${connectionOptions.edgeConfigId}&token=${connectionOptions.edgeConfigToken}`;
  const edgeConfigConnectionString = `https://edge-config.vercel.com/${connectionOptions.edgeConfigId}?token=${connectionOptions.edgeConfigToken}`;

  const edgeConfigClient = createEdgeConfigClient(edgeConfigConnectionString);

  const dataSource = new EdgeConfigDataSource({
    edgeConfigClient,
    edgeConfigItemKey,
    projectId: connectionOptions.projectId,
  });

  const environment = getFlagsEnvironment(connectionOptions.env);
  return createClient({ dataSource, environment });
}

/**
 * This function is for internal use only.
 *
 * Produces a default flags client reading from a default edge config.
 *
 * - relies on process.env.FLAGS
 * - does not use process.env.EDGE_CONFIG
 *
 * @param connectionString - usually from process.env.FLAGS
 * @returns - a flags client
 */
export function getDefaultFlagsClient() {
  if (defaultFlagsClient) return defaultFlagsClient;

  if (!process.env.FLAGS) {
    throw new Error('flags: Missing environment variable FLAGS');
  }

  defaultFlagsClient = createClientFromConnectionString(process.env.FLAGS);
  return defaultFlagsClient;
}

/**
 * Resolve the Flags environment. If connectionOptionsEnv is provided, use it as-is.
 *
 * Fall back to VERCEL_ENV if it is a known Vercel environment (production, preview, development)
 * If VERCEL_ENV is unset, it will resolve 'development' (Vercel provides it in preview and production)
 * If VERCEL_ENV is not one of the known values, it will resolve 'preview'
 */
export function getFlagsEnvironment(connectionOptionsEnv: string | null) {
  if (connectionOptionsEnv) {
    return connectionOptionsEnv;
  }
  const vercelEnv = process.env.VERCEL_ENV;
  if (!vercelEnv || vercelEnv === 'development') {
    return 'development';
  }
  if (vercelEnv === 'production') {
    return 'production';
  }
  return 'preview';
}
