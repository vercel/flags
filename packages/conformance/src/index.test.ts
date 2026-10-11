import { createServer, type Server } from 'node:http';
import { runtime } from 'flags';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  conformanceChecks,
  conformanceResult,
  runConformance,
  setConformanceSignal,
} from './index';

// A minimal framework: a Node.js server, which runs each request in
// runtime.onInvoke, and which answers a signal with 307
class Signal extends Error {}
const secret = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(
  'base64url',
);
let server: Server;
let baseURL: string;

beforeAll(async () => {
  process.env.FLAGS_SECRET = secret;
  runtime.setRethrow((error) => {
    if (error instanceof Signal) throw error;
  });
  setConformanceSignal(() => new Signal());
  server = createServer(async (incoming, outgoing) => {
    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) {
      if (typeof value === 'string') headers.set(name, value);
    }
    const request = { headers, url: `http://localhost${incoming.url}` };
    try {
      const result = await runtime.onInvoke(request, () => conformanceResult());
      outgoing.setHeader('content-type', 'application/json');
      outgoing.end(JSON.stringify(result));
    } catch (error) {
      outgoing.statusCode = error instanceof Signal ? 307 : 500;
      outgoing.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  baseURL = `http://localhost:${typeof address === 'object' && address ? address.port : 0}`;
});

afterAll(() => {
  server.close();
  delete process.env.FLAGS_SECRET;
});

describe('the conformance suite', () => {
  it('passes for a framework which follows the standard', async () => {
    const results = await runConformance({
      baseURL,
      flagsSecret: secret,
      signal: true,
    });

    expect(results.map(({ name, error }) => [name, error])).toEqual(
      conformanceChecks
        .filter((check) => !check.name.startsWith('7.2'))
        .map((check) => [check.name, undefined]),
    );
  });

  it('finds a framework which gives a new headers object for each call', async () => {
    // Without onInvoke, with a request source which returns new headers
    const results = await runConformance({
      baseURL,
      fetch: async (url, init) => {
        const headers = new Headers(init?.headers);
        runtime.setRequestSource(() => ({ headers: new Headers(headers) }));
        try {
          return Response.json(await conformanceResult());
        } finally {
          runtime.setRequestSource(undefined);
        }
      },
    });

    const once = results.find((result) =>
      result.name.startsWith('3.2 creates'),
    );
    expect(String(once?.error)).toContain('created 4 times in one request');
  });
});
