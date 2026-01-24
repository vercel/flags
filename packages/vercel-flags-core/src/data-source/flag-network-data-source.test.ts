import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { FlagNetworkDataSource } from './flag-network-data-source';

let ingestRequests: { body: unknown; headers: Headers }[] = [];

const server = setupServer(
  http.post('https://flags.vercel.com/v1/ingest', async ({ request }) => {
    ingestRequests.push({
      body: await request.json(),
      headers: request.headers,
    });
    return HttpResponse.json({ ok: true });
  }),
);

beforeAll(() => server.listen());
beforeEach(() => {
  ingestRequests = [];
});
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

async function assertIngestRequest(
  sdkKey: string,
  expectedEvents: Array<{ type: string; payload?: object }>,
) {
  await vi.waitFor(() => {
    expect(ingestRequests.length).toBeGreaterThan(0);
  });

  const request = ingestRequests[0]!;
  expect(request.headers.get('Authorization')).toBe(`Bearer ${sdkKey}`);
  expect(request.headers.get('Content-Type')).toBe('application/json');
  expect(request.headers.get('User-Agent')).toMatch(/^VercelFlagsCore\//);

  expect(request.body).toEqual(
    expectedEvents.map((event) =>
      expect.objectContaining({
        type: event.type,
        ts: expect.any(Number),
        payload: event.payload ?? expect.any(Object),
      }),
    ),
  );
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
    await dataSource.getData();

    expect(dataSource.definitions).toEqual(definitions);

    dataSource.shutdown();
    await assertIngestRequest('test-key', [{ type: 'FLAGS_CONFIG_READ' }]);
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
    await dataSource.getData();

    expect(dataSource.definitions).toEqual(definitions);

    dataSource.shutdown();
    await assertIngestRequest('test-key', [{ type: 'FLAGS_CONFIG_READ' }]);
  });

  it('should stop reconnecting after shutdown is called', async () => {
    const definitions = {
      projectId: 'test-project',
      definitions: {},
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
    await dataSource.getData();

    await vi.waitFor(() => {
      expect(dataSource.definitions).toEqual(definitions);
    });

    dataSource.shutdown();
    await dataSource._loopPromise;

    expect(dataSource.breakLoop).toBe(true);
    await assertIngestRequest('test-key', [{ type: 'FLAGS_CONFIG_READ' }]);
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
    await dataSource.getData();

    expect(dataSource.definitions).toEqual(definitions);

    dataSource.shutdown();
    await assertIngestRequest('test-key', [{ type: 'FLAGS_CONFIG_READ' }]);
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
          ]),
          { headers: { 'Content-Type': 'application/x-ndjson' } },
        );
      }),
    );

    const dataSource = new FlagNetworkDataSource({ sdkKey: 'test-key' });
    await dataSource.getData();

    await vi.waitFor(() => {
      expect(dataSource.definitions).toEqual(definitions2);
    });

    dataSource.shutdown();
    await dataSource._loopPromise;
    await assertIngestRequest('test-key', [{ type: 'FLAGS_CONFIG_READ' }]);
  });
});
