import { createClientFromConnectionString } from '@vercel/flags-core';
import { createOfrepHandler } from '@vercel/flags-core/openfeature/ofrep';
import { serve } from 'bun';
import index from './index.html';

const flagsClient = createClientFromConnectionString(
  process.env.FLAGS as string,
);

// TODO Bun.serve does not work on Vercel yet
const server = serve({
  routes: {
    // Serve index.html for all unmatched routes.
    '/*': index,
    // OpenFeature Remote Evaluation Protocol
    '/ofrep/*': createOfrepHandler(flagsClient),
  },

  development: process.env.NODE_ENV !== 'production' && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
