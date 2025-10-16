import { createClient } from '@vercel/edge-config';
import {
  createFlagsClient,
  EdgeConfigDataSource,
  type FlagsClient,
} from './client';
import type { ConnectionOptions } from './types';

export {
  createFlagsClient,
  EdgeConfigDataSource,
  type FlagsClient,
} from './client';
export { Reason } from './types';

let defaultFlagsClient: FlagsClient | null = null;

export function parseFlagsConnectionString(
  connectionString: string,
): ConnectionOptions {
  const errorMessage = 'flags: Invalid connection string';

  if (!connectionString.startsWith('flags:')) {
    // temporary backwards compatibility
    const [id, token, settingsString] = connectionString.split(':');

    if (!id || !token) {
      throw new Error(errorMessage);
    }

    const connectionSettings = new URLSearchParams(settingsString);
    const edgeConfigId = connectionSettings.get('edgeConfigId');
    const edgeConfigToken = connectionSettings.get('edgeConfigToken');
    // fall back to id here for backwards compatibility
    const projectId = connectionSettings.get('projectId') ?? id;
    if (!edgeConfigId || !edgeConfigToken || !projectId) {
      throw new Error(errorMessage);
    }

    return {
      edgeConfigId,
      edgeConfigToken,
      projectId,
      edgeConfigItemKey: connectionSettings.get('edgeConfigItemKey'),
      env: connectionSettings.get('env'),
    };
  }

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

export function createFlagsClientFromConnectionString(
  connectionString: string,
) {
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

  const edgeConfigClient = createClient(edgeConfigConnectionString);
  const dataSource = new EdgeConfigDataSource({
    edgeConfigClient,
    edgeConfigItemKey,
  });

  const environment = getFlagsEnvironment(connectionOptions.env);

  return createFlagsClient({
    dataSource,
    environment,
    connectionOptions,
  });
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

  defaultFlagsClient = createFlagsClientFromConnectionString(process.env.FLAGS);
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

// export function getValue(
//   key: string,
//   entities?: Record<string, unknown>,
//   settings?: {
//     flagsClient?: FlagsClient;
//   },
// ) {
//   const flagsClient =
//     settings?.flagsClient ?? getDefaultFlagsClient();

//   return flagsClient.resolve(key, entities);
// }
