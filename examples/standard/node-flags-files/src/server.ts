import { createServer as createHttpServer, type Server } from 'node:http';
import { evaluate } from 'flags';
import { runtime } from 'flags/runtime';
// flags/register (see package.json) compiles the flags file when Node.js
// imports it. TypeScript reads it with the content mapper (see tsconfig.json).
import { checkout, summerSale } from './app.flags';

/**
 * A plain Node.js server. Without a framework, the application calls the
 * lifecycle functions of the runtime itself.
 */
export async function createServer(): Promise<Server> {
  // Initialize the providers of all sources before the first request
  await runtime.onInit();

  return createHttpServer((incoming, outgoing) => {
    const url = new URL(incoming.url ?? '/', 'http://localhost');
    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) {
      if (typeof value === 'string') {
        headers.set(name, value);
      }
    }

    // Each request runs in onInvoke, so the flags know the request
    void runtime
      .onInvoke({ headers, url }, async () => {
        const [sale, flow] = await evaluate([summerSale, checkout]);
        return { sale, checkout: flow };
      })
      .then(
        (body) => {
          outgoing.setHeader('content-type', 'application/json');
          outgoing.end(JSON.stringify(body));
        },
        (error: unknown) => {
          outgoing.statusCode = 500;
          outgoing.end(String(error));
        },
      );
  });
}
