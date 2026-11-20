import { afterEach, describe, expect, it, vi } from 'vitest';
import loadCatalog, {
  catalogFromDatafile,
  createCatalogLoader,
} from './catalog';
import type { DatafileInput } from './types';

const SDK_KEY = 'vf_server_catalog_test';

function datafile(revision: number, keys = ['summer-sale']): DatafileInput {
  return {
    projectId: 'prj_123',
    environment: 'development',
    revision,
    definitions: Object.fromEntries(
      keys.map((key) => [
        key,
        { variants: [false, true], environments: {}, seed: 1 },
      ]),
    ),
    segments: {},
  } as unknown as DatafileInput;
}

/** A stream response which the test writes NDJSON messages to. */
function streamResponse() {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  return {
    response: new Response(body, { status: 200 }),
    send(message: unknown) {
      controller.enqueue(encoder.encode(`${JSON.stringify(message)}\n`));
    },
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('catalogFromDatafile', () => {
  it('gives the variants, the project and the revision', () => {
    expect(
      catalogFromDatafile(datafile(7), {
        describe: (key) => `About ${key}`,
      }),
    ).toEqual({
      project: { system: 'vercel-flags', projectId: 'prj_123' },
      revision: 7,
      flags: {
        'summer-sale': {
          variants: [false, true],
          description: 'About summer-sale',
        },
      },
    });
  });

  it('rejects a datafile without definitions', () => {
    expect(() =>
      catalogFromDatafile({ projectId: 'prj_123' } as DatafileInput),
    ).toThrow('no projectId or no definitions');
  });
});

describe('createCatalogLoader', () => {
  it('yields a catalog for each new revision, until the signal aborts', async () => {
    const stream = streamResponse();
    const fetch = vi.fn(async () => stream.response);
    const controller = new AbortController();
    const catalogs = createCatalogLoader({ sdkKey: SDK_KEY, fetch })({
      signal: controller.signal,
    })[Symbol.asyncIterator]();

    stream.send({ type: 'datafile', data: datafile(1) });
    expect((await catalogs.next()).value?.revision).toBe(1);

    // A reconnect sends the same revision again, which gives no catalog
    stream.send({ type: 'datafile', data: datafile(1) });
    stream.send({
      type: 'datafile',
      data: datafile(2, ['summer-sale', 'new']),
    });
    const second = await catalogs.next();
    expect(second.value?.revision).toBe(2);
    expect(Object.keys(second.value?.flags ?? {})).toEqual([
      'summer-sale',
      'new',
    ]);

    controller.abort();
    expect(await catalogs.next()).toEqual({ done: true, value: undefined });
    expect(fetch).toHaveBeenCalledWith(
      'https://flags.vercel.com/v1/stream',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${SDK_KEY}`,
        }),
      }),
    );
  });

  it('uses the SDK key of FLAGS by default', async () => {
    vi.stubEnv('FLAGS', SDK_KEY);
    const stream = streamResponse();
    const fetch = vi.fn(async () => stream.response);
    const controller = new AbortController();
    const catalogs = createCatalogLoader({ fetch })({
      signal: controller.signal,
    })[Symbol.asyncIterator]();

    stream.send({ type: 'datafile', data: datafile(1) });
    await catalogs.next();
    controller.abort();

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${SDK_KEY}`,
        }),
      }),
    );
  });

  it('throws for a key without access', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetch = vi.fn(async () => new Response(null, { status: 401 }));
    const catalogs = createCatalogLoader({ sdkKey: SDK_KEY, fetch })({
      signal: new AbortController().signal,
    })[Symbol.asyncIterator]();

    await expect(catalogs.next()).rejects.toThrow('unauthorized (401)');
    errorSpy.mockRestore();
  });

  it('is the default export, for catalog.ts', () => {
    expect(typeof loadCatalog).toBe('function');
  });
});
