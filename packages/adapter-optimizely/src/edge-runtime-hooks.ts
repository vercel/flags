import { LogEvent } from '@optimizely/optimizely-sdk';

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
