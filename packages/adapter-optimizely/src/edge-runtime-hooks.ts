import type { LogEvent } from '@optimizely/optimizely-sdk';

/**
 * Web standards friendly event dispatcher for Optimizely
 * uses `waitUntil()` to avoid blocking the visitor's page load
 *
 * This does not send back the status code to the dispatcher as it runs in `waitUntil()`
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
  });

  import('@vercel/functions').then(({ waitUntil }) => {
    waitUntil(dispatch);
  });
}
