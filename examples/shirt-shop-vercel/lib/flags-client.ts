import { createClient } from '@vercel/flags-core';
import { wrapFetch } from './debug-fetch';

export const flagsClient = createClient(process.env.FLAGS as string, {
  fetch: wrapFetch(fetch.bind(globalThis)),
});
