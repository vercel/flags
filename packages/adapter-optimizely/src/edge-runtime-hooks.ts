import { LogEvent } from '@optimizely/optimizely-sdk';

/**
 * Web standards friendly event dispatcher for Optimizely
 * uses `after` to avoid blocking the visitor's page load
 */
async function dispatchEvent(
  event: LogEvent,
  callback?: (response: { statusCode: number }) => void,
) {
  // Non-POST requests not supported
  if (event.httpVerb !== 'POST') {
    return;
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
        callback?.({ statusCode: response.status });
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
