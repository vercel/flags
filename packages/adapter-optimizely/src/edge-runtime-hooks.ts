import {
  createPollingProjectConfigManager,
  LogEvent,
} from '@optimizely/optimizely-sdk';
import { createClient } from '@vercel/edge-config';

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
 */
export async function createEdgeProjectConfigManager(options: {
  edgeConfigConnectionString: string;
  edgeConfigItemKey: string;
}) {
  const edgeConfigClient = createClient(options.edgeConfigConnectionString);
  const datafile = await edgeConfigClient.get<string>(
    options.edgeConfigItemKey,
  );

  // There's no export in the Optimizely SDK for a custom project config manager so need to disable any auto updates for the polling manager
  return createPollingProjectConfigManager({
    datafile,
    // sdkKey is not used for Edge Config
    sdkKey: '',
    // Never try to update the datafile
    updateInterval: Infinity,
    autoUpdate: false,
  });
}
