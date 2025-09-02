import { LogEvent } from '@optimizely/optimizely-sdk';
import {
  OpaqueConfigManager,
  wrapConfigManager,
} from '@optimizely/optimizely-sdk/dist/project_config/config_manager_factory';
import { ProjectConfigManagerImpl } from '@optimizely/optimizely-sdk/dist/project_config/project_config_manager';

/**
 * Web standards friendly event dispatcher for Optimizely
 * uses `after` to avoid blocking the visitor's page load
 */
export async function dispatchEvent(event: LogEvent) {
  // Non-POST requests not supported
  if (event.httpVerb !== 'POST') {
    throw new Error(
      'Optimizely Event Dispatcher: Only POST requests are supported',
    );
  }

  const url = new URL(event.url);
  const data = JSON.stringify(event.params);

  const dispatch = fetch(url, {
    method: 'POST',
    body: data,
    headers: {
      'Content-Type': 'application/json',
    },
  })
    .then((response) => {
      if (response.ok) {
        return { statusCode: response.status };
      }
    })
    .catch((error) => {
      console.error('Error dispatching event:', error);
    });

  try {
    import('@vercel/functions').then(({ waitUntil }) => {
      waitUntil(dispatch);
    });
  } catch (error) {
    console.error('Error dispatching event:', error);
  }
}

/**
 * Edge runtime specific project config manager that loads the datafile from Edge Config.
 * Excludes a datafile manager as there's no need to poll for updates.
 */
export async function createEdgeProjectConfigManager(options: {
  edgeConfigConnectionString: string;
  edgeConfigItemKey: string;
}): Promise<OpaqueConfigManager> {
  const { createClient } = await import('@vercel/edge-config');
  const edgeConfigClient = createClient(options.edgeConfigConnectionString);
  const datafile = edgeConfigClient.get(options.edgeConfigItemKey);

  return wrapConfigManager(
    new ProjectConfigManagerImpl({
      datafile,
    }),
  );
}
