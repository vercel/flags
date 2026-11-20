import { createServer as createHttpServer, type Server } from 'node:http';
import { evaluate } from 'flags';
import { runtime } from 'flags/runtime';
import { bannerText, betaBanner, summerSale, teamInsights } from './flags.ts';

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
        const [sale, banner, beta] = await evaluate([
          summerSale,
          bannerText,
          betaBanner,
        ]);
        const teamSlug = url.searchParams.get('team');
        const insights = teamSlug
          ? await teamInsights({ evaluationContext: { teamSlug } })
          : null;
        return { sale, banner, beta, insights };
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
