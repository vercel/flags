import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  afterEach,
  beforeEach,
} from 'vitest';
import { devunusAdapter } from './index';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

const server = setupServer(
  http.get('https://api.devunus.com/api/flags', ({ request }) => {
    const authHeader = request.headers.get('Authorization');
    return HttpResponse.json({
      flags: [
        {
          id: 'flag1',
          name: 'enableFeatureX',
          description: 'Enable feature X',
          value: true,
          type: 'boolean',
          createdAt: 1615000000000,
          updatedAt: 1620000000000,
        },
      ],
      baseUrl: 'https://app.devunus.com/admin/333/project/1',
    });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

describe('Devunus default adapter', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.DEVUNUS_ENV_KEY = 'test-key';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should create an adapter with correct interface', () => {
    const adapter = devunusAdapter.getFeature();
    expect(adapter.provider).toBe('devunus');
    expect(typeof adapter.getProviderData).toBe('function');
  });

  it('should pass environment variables to provider', async () => {
    const customKey = 'custom-key';
    process.env.DEVUNUS_ENV_KEY = customKey;
    const adapter = devunusAdapter.getFeature();
    await adapter.getProviderData();
    // We only test that the adapter properly passes the env var
    // The actual API response handling is tested in provider tests
  });

  it('should construct correct origin URL with project ID', async () => {
    process.env.DEVUNUS_PROJECT_ID = 'test-project';
    const adapter = devunusAdapter.getFeature();
    const result = await adapter.getProviderData();

    const featureX = result.definitions.enableFeatureX;
    expect(featureX?.origin).toEqual(
      'https://app.devunus.com/admin/333/project/1/flag/flag1',
    );
  });

  it('should properly initialize with default configuration', () => {
    const adapter = devunusAdapter.getFeature();
    expect(adapter).toBeDefined();
    expect(adapter.provider).toBe('devunus');
  });
});
