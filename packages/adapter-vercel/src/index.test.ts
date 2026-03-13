import { flagsClient, resetDefaultFlagsClient } from '@vercel/flags-core';
import type { Origin, ProviderData } from 'flags';
import { flag } from 'flags/next';
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
import {
  createVercelAdapter,
  getProviderData,
  resetDefaultVercelAdapter,
  vercelAdapter,
} from '.';

const mocks = vi.hoisted(() => {
  return {
    headers: vi.fn(),
    cookies: vi.fn(() => ({ get: vi.fn() })),
  };
});

vi.mock('next/headers', async (importOriginal) => {
  const mod = await importOriginal<typeof import('next/headers')>();
  return {
    ...mod,
    headers: mocks.headers,
    cookies: mocks.cookies,
  };
});

// Mock @vercel/functions
vi.mock('@vercel/functions', () => ({
  waitUntil: vi.fn(),
}));

const server = setupServer();

function createNdjsonStream(messages: object[]): ReadableStream {
  return new ReadableStream({
    async start(controller) {
      for (const message of messages) {
        controller.enqueue(
          new TextEncoder().encode(`${JSON.stringify(message)}\n`),
        );
      }
      controller.close();
    },
  });
}

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('createVercelAdapter', () => {
  let originalFlagsSecret: string | undefined;
  let originalFlags: string | undefined;

  beforeAll(() => {
    originalFlagsSecret = process.env.FLAGS_SECRET;
    originalFlags = process.env.FLAGS;
    process.env.FLAGS_SECRET = 'a'.repeat(32);
    process.env.FLAGS = 'vf_test_sdk_key';
  });

  afterAll(() => {
    process.env.FLAGS_SECRET = originalFlagsSecret;
    process.env.FLAGS = originalFlags;
  });

  beforeEach(() => {
    resetDefaultFlagsClient();
    resetDefaultVercelAdapter();
  });

  it('returns a full definition', () => {
    const adapter = createVercelAdapter(flagsClient);

    const amended = adapter();
    expect(amended).toHaveProperty('decide');
    expect(amended).toHaveProperty('origin', {
      provider: 'vercel',
      sdkKey: 'vf_test_sdk_key',
    } satisfies Origin);
  });

  it('returns origin when created with sdkKey string', () => {
    const adapter = createVercelAdapter('vf_my_sdk_key');

    const amended = adapter();
    expect(amended).toHaveProperty('decide');
    expect(amended).toHaveProperty('origin', {
      provider: 'vercel',
      sdkKey: 'vf_my_sdk_key',
    } satisfies Origin);
  });
});

describe('when used with getProviderData', () => {
  let originalFlags: string | undefined;

  beforeAll(() => {
    originalFlags = process.env.FLAGS;
    process.env.FLAGS = 'vf_test_sdk_key';
  });

  afterAll(() => {
    process.env.FLAGS = originalFlags;
  });

  beforeEach(() => {
    resetDefaultFlagsClient();
    resetDefaultVercelAdapter();

    // Mock the datafile endpoint for getDatafile
    server.use(
      http.get('https://flags.vercel.com/v1/datafile', () => {
        return HttpResponse.json({
          projectId: 'prj_xxx',
          definitions: {},
          segments: {},
        });
      }),
    );
  });

  it('returns data', async () => {
    const testFlag = flag({
      key: 'test-flag',
      adapter: vercelAdapter(),
    });

    const providerData = await getProviderData({ testFlag });

    expect(providerData).toEqual({
      definitions: {
        'test-flag': {
          declaredInCode: true,
          description: undefined,
          defaultValue: undefined,
          options: undefined,
          origin: {
            provider: 'vercel',
            projectId: 'prj_xxx',
          },
        },
      },
      hints: [],
    } satisfies ProviderData);
  });
});

describe('vercelAdapter', () => {
  let originalFlagsSecret: string | undefined;
  let originalFlags: string | undefined;

  beforeEach(() => {
    originalFlagsSecret = process.env.FLAGS_SECRET;
    originalFlags = process.env.FLAGS;
    process.env.FLAGS_SECRET = 'a'.repeat(32);
    process.env.FLAGS = 'vf_test_sdk_key';

    resetDefaultFlagsClient();
    resetDefaultVercelAdapter();
  });

  afterEach(() => {
    process.env.FLAGS_SECRET = originalFlagsSecret;
    process.env.FLAGS = originalFlags;
  });

  // Skipped: Next.js 16+ has stricter request scope checking for headers()
  // that cannot be easily mocked in unit tests. The adapter functionality
  // is tested through integration tests instead.
  it.skip('resolves when called', async () => {
    mocks.headers.mockReturnValueOnce(new Headers());

    const definitions = {
      projectId: 'test-project',
      definitions: {
        'test-flag': {
          variantIds: undefined,
          environments: { production: 0 },
          variants: [true],
          seed: undefined,
        },
      },
      segments: {},
    };

    server.use(
      http.get('https://flags.vercel.com/v1/stream', () => {
        return new HttpResponse(
          createNdjsonStream([{ type: 'datafile', data: definitions }]),
          { headers: { 'Content-Type': 'application/x-ndjson' } },
        );
      }),
    );

    const testFlag = flag({ key: 'test-flag', adapter: vercelAdapter() });
    await expect(testFlag()).resolves.toEqual(true);
  });

  describe('origin', () => {
    it('sets vercel origin when using default adapter', () => {
      const testFlag = flag({ key: 'test-flag', adapter: vercelAdapter() });
      expect(testFlag.origin).toEqual({
        provider: 'vercel',
        sdkKey: 'vf_test_sdk_key',
      } satisfies Origin);
    });

    it('sets vercel origin when using adapter created with sdkKey', () => {
      const adapter = createVercelAdapter('vf_my_sdk_key');
      const testFlag = flag({ key: 'test-flag', adapter: adapter() });
      expect(testFlag.origin).toEqual({
        provider: 'vercel',
        sdkKey: 'vf_my_sdk_key',
      } satisfies Origin);
    });
  });
});
