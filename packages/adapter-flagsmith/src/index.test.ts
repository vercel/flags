import flagsmith from 'flagsmith';
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
import { getProviderData } from './provider';
import * as mocks from './test-mocks';

vi.stubEnv('FLAGSMITH_ENVIRONMENT_ID', 'test-env-id');

vi.mock('flagsmith', () => ({
  default: {
    init: vi.fn(),
    getState: vi.fn(),
    identify: vi.fn(),
    initialised: false,
  },
}));

describe('Flagsmith Adapter', () => {
  let flagsmithAdapter: any;
  const mockHeaders = {} as any;
  const mockCookies = {} as any;
  const mockEnvironmentId = 'test-env-id';

  beforeEach(async () => {
    const mod = await import('.');
    flagsmithAdapter = mod.flagsmithAdapter;
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.mocked(flagsmith.init).mockClear();
    vi.clearAllMocks();
  });

  describe('getValue', () => {
    describe('without coercion', () => {
      it('should return raw string value when no coercion is specified', async () => {
        const adapter = flagsmithAdapter.getValue();

        vi.mocked(flagsmith.getState).mockReturnValue(mocks.stringFlag);

        const value = await adapter.decide({
          key: 'test-flag',
          defaultValue: 'default',
          entities: undefined,
          headers: mockHeaders,
          cookies: mockCookies,
        });

        expect(value).toBe('raw-string-value');
      });

      it('should return raw number value when no coercion is specified', async () => {
        const adapter = flagsmithAdapter.getValue();

        vi.mocked(flagsmith.getState).mockReturnValue(mocks.numberFlag);

        const value = await adapter.decide({
          key: 'test-flag',
          defaultValue: 0,
          entities: undefined,
          headers: mockHeaders,
          cookies: mockCookies,
        });

        expect(value).toBe(42);
      });

      it('should return raw boolean value when no coercion is specified', async () => {
        const adapter = flagsmithAdapter.getValue();

        vi.mocked(flagsmith.getState).mockReturnValue(mocks.booleanTrueFlag);

        const value = await adapter.decide({
          key: 'test-flag',
          defaultValue: false,
          entities: undefined,
          headers: mockHeaders,
          cookies: mockCookies,
        });

        expect(value).toBe(true);
      });

      it('should return default value when flag value is empty', async () => {
        const adapter = flagsmithAdapter.getValue();

        vi.mocked(flagsmith.getState).mockReturnValue(mocks.emptyStringFlag);

        const value = await adapter.decide({
          key: 'test-flag',
          defaultValue: 'default',
          entities: undefined,
          headers: mockHeaders,
          cookies: mockCookies,
        });

        expect(value).toBe('default');
      });

      it('should return default value when flag value is null', async () => {
        const adapter = flagsmithAdapter.getValue();

        vi.mocked(flagsmith.getState).mockReturnValue(mocks.nullFlag);

        const value = await adapter.decide({
          key: 'test-flag',
          defaultValue: 'default',
          entities: undefined,
          headers: mockHeaders,
          cookies: mockCookies,
        });

        expect(value).toBe('default');
      });
    });

    describe('with string coercion', () => {
      it('should coerce number to string', async () => {
        const adapter = flagsmithAdapter.getValue({ coerce: 'string' });

        vi.mocked(flagsmith.getState).mockReturnValue(mocks.numberFlag);

        const value = await adapter.decide({
          key: 'test-flag',
          defaultValue: 'default',
          entities: undefined,
          headers: mockHeaders,
          cookies: mockCookies,
        });

        expect(value).toBe('42');
      });

      it('should coerce boolean to string', async () => {
        const adapter = flagsmithAdapter.getValue({ coerce: 'string' });

        vi.mocked(flagsmith.getState).mockReturnValue(mocks.booleanTrueFlag);

        const value = await adapter.decide({
          key: 'test-flag',
          defaultValue: 'default',
          entities: undefined,
          headers: mockHeaders,
          cookies: mockCookies,
        });

        expect(value).toBe('true');
      });

      it('should return default value for null instead of "null" string', async () => {
        const adapter = flagsmithAdapter.getValue({ coerce: 'string' });

        vi.mocked(flagsmith.getState).mockReturnValue(mocks.nullFlag);

        const value = await adapter.decide({
          key: 'test-flag',
          defaultValue: 'default',
          entities: undefined,
          headers: mockHeaders,
          cookies: mockCookies,
        });

        expect(value).toBe('default');
      });

      it('should return default value for NaN instead of "NaN" string', async () => {
        const adapter = flagsmithAdapter.getValue({ coerce: 'string' });

        vi.mocked(flagsmith.getState).mockReturnValue(mocks.nanFlag);

        const value = await adapter.decide({
          key: 'test-flag',
          defaultValue: 'default',
          entities: undefined,
          headers: mockHeaders,
          cookies: mockCookies,
        });

        expect(value).toBe('default');
      });
    });

    describe('with number coercion', () => {
      it('should coerce string to number', async () => {
        const adapter = flagsmithAdapter.getValue({ coerce: 'number' });

        vi.mocked(flagsmith.getState).mockReturnValue(mocks.stringNumberFlag);

        const value = await adapter.decide({
          key: 'test-flag',
          defaultValue: 0,
          entities: undefined,
          headers: mockHeaders,
          cookies: mockCookies,
        });

        expect(value).toBe(123);
      });

      it('should return default value when string cannot be coerced to number', async () => {
        const adapter = flagsmithAdapter.getValue({ coerce: 'number' });

        vi.mocked(flagsmith.getState).mockReturnValue(
          mocks.stringInvalidNumberFlag,
        );

        const value = await adapter.decide({
          key: 'test-flag',
          defaultValue: 99,
          entities: undefined,
          headers: mockHeaders,
          cookies: mockCookies,
        });

        expect(value).toBe(99);
      });

      it('should coerce boolean true to number 1', async () => {
        const adapter = flagsmithAdapter.getValue({ coerce: 'number' });

        vi.mocked(flagsmith.getState).mockReturnValue(mocks.booleanTrueFlag);

        const value = await adapter.decide({
          key: 'test-flag',
          defaultValue: 0,
          entities: undefined,
          headers: mockHeaders,
          cookies: mockCookies,
        });

        expect(value).toBe(1);
      });

      it('should coerce boolean false to number 0', async () => {
        const adapter = flagsmithAdapter.getValue({ coerce: 'number' });

        vi.mocked(flagsmith.getState).mockReturnValue(mocks.booleanFalseFlag);

        const value = await adapter.decide({
          key: 'test-flag',
          defaultValue: 99,
          entities: undefined,
          headers: mockHeaders,
          cookies: mockCookies,
        });

        expect(value).toBe(0);
      });
    });

    describe('with boolean coercion', () => {
      it('should coerce string "true" to boolean', async () => {
        const adapter = flagsmithAdapter.getValue({ coerce: 'boolean' });

        vi.mocked(flagsmith.getState).mockReturnValue(mocks.stringTrueFlag);

        const value = await adapter.decide({
          key: 'test-flag',
          defaultValue: false,
          entities: undefined,
          headers: mockHeaders,
          cookies: mockCookies,
        });

        expect(value).toBe(true);
      });

      it('should coerce string "false" to boolean', async () => {
        const adapter = flagsmithAdapter.getValue({ coerce: 'boolean' });

        vi.mocked(flagsmith.getState).mockReturnValue(mocks.stringFalseFlag);

        const value = await adapter.decide({
          key: 'test-flag',
          defaultValue: true,
          entities: undefined,
          headers: mockHeaders,
          cookies: mockCookies,
        });

        expect(value).toBe(false);
      });

      it('should coerce number 1 to true', async () => {
        const adapter = flagsmithAdapter.getValue({ coerce: 'boolean' });

        vi.mocked(flagsmith.getState).mockReturnValue(mocks.numberOneFlag);

        const value = await adapter.decide({
          key: 'test-flag',
          defaultValue: false,
          entities: undefined,
          headers: mockHeaders,
          cookies: mockCookies,
        });

        expect(value).toBe(true);
      });

      it('should coerce number 0 to false', async () => {
        const adapter = flagsmithAdapter.getValue({ coerce: 'boolean' });

        vi.mocked(flagsmith.getState).mockReturnValue(mocks.numberZeroFlag);

        const value = await adapter.decide({
          key: 'test-flag',
          defaultValue: true,
          entities: undefined,
          headers: mockHeaders,
          cookies: mockCookies,
        });

        expect(value).toBe(false);
      });

      it('should fall back to flagState.enabled when value cannot be coerced to boolean', async () => {
        const adapter = flagsmithAdapter.getValue({ coerce: 'boolean' });

        vi.mocked(flagsmith.getState).mockReturnValue(
          mocks.stringInvalidBooleanFlag,
        );

        const value = await adapter.decide({
          key: 'test-flag',
          defaultValue: false,
          entities: undefined,
          headers: mockHeaders,
          cookies: mockCookies,
        });

        expect(value).toBe(true);
      });

      it('should fall back to flagState.enabled when number is not 0 or 1', async () => {
        const adapter = flagsmithAdapter.getValue({ coerce: 'boolean' });

        vi.mocked(flagsmith.getState).mockReturnValue(
          mocks.numberInvalidBooleanFlag,
        );

        const value = await adapter.decide({
          key: 'test-flag',
          defaultValue: false,
          entities: undefined,
          headers: mockHeaders,
          cookies: mockCookies,
        });

        expect(value).toBe(true);
      });

      it('should fall back to flagState.enabled when value cannot be coerced to boolean and flag is enabled', async () => {
        const adapter = flagsmithAdapter.getValue({ coerce: 'boolean' });

        vi.mocked(flagsmith.getState).mockReturnValue(
          mocks.nonBooleanValueEnabledFlag,
        );

        const value = await adapter.decide({
          key: 'test-flag',
          defaultValue: false,
          entities: undefined,
          headers: mockHeaders,
          cookies: mockCookies,
        });

        expect(value).toBe(true);
      });
    });
  });

  describe('getProviderData', () => {
    const restHandlers = [
      http.get('https://api.flagsmith.com/api/v1/flags/', () => {
        return HttpResponse.json([
          {
            id: 1,
            feature: {
              id: 1,
              name: 'test-flag',
              created_date: '2023-01-01T00:00:00.000Z',
              description: 'Show demo banner',
              initial_value: 'false',
              default_enabled: false,
              type: 'STANDARD',
            },
            feature_state_value: 'true',
            environment: 1,
            identity: null,
            feature_segment: null,
            enabled: true,
          },
          {
            id: 2,
            feature: {
              id: 2,
              name: 'multivariate_test',
              created_date: '2023-01-02T00:00:00.000Z',
              description: 'Multivariate test flag',
              initial_value: 'control',
              default_enabled: true,
              type: 'MULTIVARIATE',
            },
            feature_state_value: 'variant_a',
            environment: 1,
            identity: null,
            feature_segment: null,
            enabled: true,
          },
        ]);
      }),
      http.get(
        'https://api.flagsmith.com/api/v1/flags/2/multivariate-options/',
        () => {
          return HttpResponse.json({
            control_value: 'control',
            options: [{ value: 'variant_a' }, { value: 'variant_b' }],
          });
        },
      ),
    ];

    const server = setupServer(...restHandlers);
    beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
    afterAll(() => server.close());
    afterEach(() => server.resetHandlers());

    it('should fetch and return provider data with valid params', async () => {
      const providerData = await getProviderData({
        environmentKey: mockEnvironmentId,
        projectId: 'test-project',
      });
      expect(providerData).toBeDefined();
      expect(providerData.definitions).toBeDefined();
      expect(providerData).toEqual({
        hints: [],
        definitions: {
          'test-flag': {
            description: 'Show demo banner',
            origin: `https://app.flagsmith.com/project/test-project/environment/${mockEnvironmentId}/features/?feature=1`,
            createdAt: 1672531200000,
            options: [
              { label: 'Off', value: false },
              { label: 'On', value: true },
            ],
          },
          multivariate_test: {
            description: 'Multivariate test flag',
            origin: `https://app.flagsmith.com/project/test-project/environment/${mockEnvironmentId}/features/?feature=2`,
            createdAt: 1672617600000,
            options: [
              { label: 'control', value: 'control' },
              { label: 'variant_a', value: 'variant_a' },
              { label: 'variant_b', value: 'variant_b' },
            ],
          },
        },
      });
    });
  });
});
