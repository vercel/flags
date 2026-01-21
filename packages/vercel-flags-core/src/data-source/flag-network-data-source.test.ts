import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { FlagNetworkDataSource } from './flag-network-data-source';

const server = setupServer();

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function createNdjsonStream(messages: object[], delayMs = 0): ReadableStream {
  return new ReadableStream({
    async start(controller) {
      for (const message of messages) {
        if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
        controller.enqueue(
          new TextEncoder().encode(JSON.stringify(message) + '\n'),
        );
      }
      controller.close();
    },
  });
}

describe('FlagNetworkDataSource', () => {
  it('should parse datafile messages from NDJSON stream', async () => {
    const definitions = {
      projectId: 'test-project',
      definitions: { 'my-flag': { variants: [true, false] } },
    };

    server.use(
      http.get('https://flags.vercel.com/v1/stream', () => {
        return new HttpResponse(
          createNdjsonStream([{ type: 'datafile', data: definitions }]),
          { headers: { 'Content-Type': 'application/x-ndjson' } },
        );
      }),
    );

    const dataSource = new FlagNetworkDataSource({ sdkKey: 'test-key' });
    await dataSource.subscribe();

    expect(dataSource.definitions).toEqual(definitions);
  });

  it('should ignore ping messages', async () => {
    const definitions = {
      projectId: 'test-project',
      definitions: {},
    };

    server.use(
      http.get('https://flags.vercel.com/v1/stream', () => {
        return new HttpResponse(
          createNdjsonStream([
            { type: 'ping' },
            { type: 'datafile', data: definitions },
            { type: 'ping' },
          ]),
          { headers: { 'Content-Type': 'application/x-ndjson' } },
        );
      }),
    );

    const dataSource = new FlagNetworkDataSource({ sdkKey: 'test-key' });
    await dataSource.subscribe();

    expect(dataSource.definitions).toEqual(definitions);
  });

  it('should stop reconnecting on terminate message', async () => {
    const definitions = {
      projectId: 'test-project',
      definitions: {},
    };

    server.use(
      http.get('https://flags.vercel.com/v1/stream', () => {
        return new HttpResponse(
          createNdjsonStream([
            { type: 'datafile', data: definitions },
            { type: 'terminate', reason: 'sdk-key-revoked' },
          ]),
          { headers: { 'Content-Type': 'application/x-ndjson' } },
        );
      }),
    );

    const dataSource = new FlagNetworkDataSource({ sdkKey: 'test-key' });
    await dataSource.subscribe();

    // Wait for the loop to process the terminate message
    await dataSource._loopPromise;

    expect(dataSource.breakLoop).toBe(true);
  });

  it('should handle messages split across chunks', async () => {
    const definitions = {
      projectId: 'test-project',
      definitions: { flag: { variants: [1, 2, 3] } },
    };

    const fullMessage = JSON.stringify({ type: 'datafile', data: definitions });
    const part1 = fullMessage.slice(0, 20);
    const part2 = fullMessage.slice(20) + '\n';

    server.use(
      http.get('https://flags.vercel.com/v1/stream', () => {
        return new HttpResponse(
          new ReadableStream({
            async start(controller) {
              controller.enqueue(new TextEncoder().encode(part1));
              await new Promise((r) => setTimeout(r, 10));
              controller.enqueue(new TextEncoder().encode(part2));
              controller.close();
            },
          }),
          { headers: { 'Content-Type': 'application/x-ndjson' } },
        );
      }),
    );

    const dataSource = new FlagNetworkDataSource({ sdkKey: 'test-key' });
    await dataSource.subscribe();

    expect(dataSource.definitions).toEqual(definitions);
  });

  it('should update definitions when new datafile messages arrive', async () => {
    const definitions1 = { projectId: 'test', definitions: { v: 1 } };
    const definitions2 = { projectId: 'test', definitions: { v: 2 } };

    server.use(
      http.get('https://flags.vercel.com/v1/stream', () => {
        return new HttpResponse(
          createNdjsonStream([
            { type: 'datafile', data: definitions1 },
            { type: 'datafile', data: definitions2 },
            { type: 'terminate', reason: 'sdk-key-revoked' },
          ]),
          { headers: { 'Content-Type': 'application/x-ndjson' } },
        );
      }),
    );

    const dataSource = new FlagNetworkDataSource({ sdkKey: 'test-key' });
    await dataSource.subscribe();

    // Wait for stream to complete
    await dataSource._loopPromise;

    expect(dataSource.definitions).toEqual(definitions2);
  });
});
