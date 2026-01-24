import {
  getDefaultFlagsClient,
  resetDefaultFlagsClient,
} from '@vercel/flags-core';
import type { Origin, ProviderData } from 'flags';
import { flag, getProviderData } from 'flags/next';
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
    // replace some exports
    headers: mocks.headers,
    cookies: mocks.cookies,
  };
});

const edgeConfigMocks = vi.hoisted(() => {
  return { createClient: vi.fn() };
});

describe('createVercelAdapter', () => {
  let originalFlagsSecret: string | undefined;
  let originalFlags: string | undefined;
  beforeAll(() => {
    originalFlagsSecret = process.env.FLAGS_SECRET;
    originalFlags = process.env.FLAGS;
    process.env.FLAGS_SECRET = 'a'.repeat(32);
    process.env.FLAGS =
      'flags:projectId=prj_xxx&edgeConfigId=a&edgeConfigToken=b&edgeConfigItemKey=c';
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
    const flagsClient = getDefaultFlagsClient();
    const adapter = createVercelAdapter(flagsClient);

    const amended = adapter();
    expect(amended).toHaveProperty('decide');
    expect(amended).toHaveProperty('origin', {
      provider: 'vercel',
      projectId: 'prj_xxx',
      env: 'development',
    } satisfies Origin);
  });
});

describe('when used with getProviderData', () => {
  it('returns data', () => {
    const testFlag = flag({
      key: 'test-flag',
      adapter: vercelAdapter(),
    });
    expect(getProviderData({ testFlag })).toEqual({
      definitions: {
        'test-flag': {
          declaredInCode: true,
          description: undefined,
          defaultValue: undefined,
          options: undefined,
          origin: {
            provider: 'vercel',
            projectId: 'prj_xxx',
            env: 'development',
          },
        },
      },
      hints: [],
    } satisfies ProviderData);
  });
});
describe.skip('vercelAdapter', () => {
  let originalFlagsSecret: string | undefined;
  let originalFlags: string | undefined;
  beforeEach(() => {
    originalFlagsSecret = process.env.FLAGS_SECRET;
    originalFlags = process.env.FLAGS;
    process.env.FLAGS_SECRET = 'a'.repeat(32);
    process.env.FLAGS =
      'flags:projectId=prj_xxx&edgeConfigId=a&edgeConfigToken=b&edgeConfigItemKey=c';

    resetDefaultFlagsClient();
    resetDefaultVercelAdapter();
  });

  afterEach(() => {
    process.env.FLAGS_SECRET = originalFlagsSecret;
    process.env.FLAGS = originalFlags;
  });

  it('resolves when called', async () => {
    mocks.headers.mockReturnValueOnce(new Headers());

    const get = vi.fn().mockReturnValueOnce({
      definitions: {
        'test-flag': {
          variantIds: undefined,
          environments: [Object],
          variants: [Array],
          seed: undefined,
        },
      },
      segments: undefined,
    });

    edgeConfigMocks.createClient.mockReturnValue({ get });

    const testFlag = flag({ key: 'test-flag', adapter: vercelAdapter() });
    await expect(testFlag()).resolves.toEqual(true);
    expect(get).toHaveBeenCalledWith('c');
  });

  describe('origin', () => {
    it('sets vercel as the origin', () => {
      const testFlag = flag({ key: 'test-flag', adapter: vercelAdapter() });
      expect(testFlag.origin).toEqual({
        provider: 'vercel',
        projectId: 'prj_xxx',
        env: 'development',
      } satisfies Origin);
    });
  });
});
