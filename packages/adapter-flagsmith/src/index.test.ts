import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import flagsmith, { IState, IIdentity } from 'flagsmith';

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

  describe('booleanValue', () => {
    it('should initialize the adapter', async () => {
      const adapter = flagsmithAdapter.booleanValue();
      expect(adapter).toBeDefined();
      expect(adapter.decide).toBeDefined();
    });

    it('should initialize Flagsmith with correct environment ID', async () => {
      const adapter = flagsmithAdapter.booleanValue();

      vi.mocked(flagsmith.getState).mockReturnValue({
        flags: {
          'test-flag': {
            enabled: true,
            value: 'some-value',
          },
        },
        api: 'https://api.flagsmith.com/api/v1/',
      } as IState<string>);

      await adapter.decide({
        key: 'test-flag',
        defaultValue: false,
        entities: undefined,
        headers: mockHeaders,
        cookies: mockCookies,
      });

      expect(flagsmith.init).toHaveBeenCalledWith({
        fetch: expect.any(Function),
        environmentID: mockEnvironmentId,
      });
    });

    it('should return flag enabled state for boolean values', async () => {
      const adapter = flagsmithAdapter.booleanValue();

      vi.mocked(flagsmith.getState).mockReturnValue({
        flags: {
          'test-flag': {
            enabled: true,
            value: 'some-value',
          },
        },
        api: 'https://api.flagsmith.com/api/v1/',
      } as IState<string>);

      const value = await adapter.decide({
        key: 'test-flag',
        defaultValue: false,
        entities: undefined,
        headers: mockHeaders,
        cookies: mockCookies,
      });

      expect(value).toBe(true);
    });

    it('should return default value when flag is not found', async () => {
      const adapter = flagsmithAdapter.booleanValue();

      vi.mocked(flagsmith.getState).mockReturnValue({
        flags: {},
        api: 'https://api.flagsmith.com/api/v1/',
      } as IState<string>);

      const value = await adapter.decide({
        key: 'non-existent-flag',
        defaultValue: false,
        entities: undefined,
        headers: mockHeaders,
        cookies: mockCookies,
      });

      expect(value).toBe(false);
    });
  });

  describe('stringValue', () => {
    it('should return string value when flag is enabled', async () => {
      const adapter = flagsmithAdapter.stringValue();

      vi.mocked(flagsmith.getState).mockReturnValue({
        flags: {
          'test-flag': {
            enabled: true,
            value: 'test-value',
          },
        },
        api: 'https://api.flagsmith.com/api/v1/',
      } as IState<string>);

      const value = await adapter.decide({
        key: 'test-flag',
        defaultValue: 'default',
        entities: undefined,
        headers: mockHeaders,
        cookies: mockCookies,
      });

      expect(value).toBe('test-value');
    });

    it('should return default value when flag is disabled', async () => {
      const adapter = flagsmithAdapter.stringValue();

      vi.mocked(flagsmith.getState).mockReturnValue({
        flags: {
          'test-flag': {
            enabled: false,
            value: 'test-value',
          },
        },
        api: 'https://api.flagsmith.com/api/v1/',
      } as IState<string>);

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

  describe('numberValue', () => {
    it('should return number value when flag is enabled', async () => {
      const adapter = flagsmithAdapter.numberValue();

      vi.mocked(flagsmith.getState).mockReturnValue({
        flags: {
          'test-flag': {
            enabled: true,
            value: 42,
          },
        },
        api: 'https://api.flagsmith.com/api/v1/',
      } as IState<string>);

      const value = await adapter.decide({
        key: 'test-flag',
        defaultValue: 0,
        entities: undefined,
        headers: mockHeaders,
        cookies: mockCookies,
      });

      expect(value).toBe(42);
    });

    it('should return default value when flag is disabled', async () => {
      const adapter = flagsmithAdapter.numberValue();

      vi.mocked(flagsmith.getState).mockReturnValue({
        flags: {
          'test-flag': {
            enabled: false,
            value: 42,
          },
        },
        api: 'https://api.flagsmith.com/api/v1/',
      } as IState<string>);

      const value = await adapter.decide({
        key: 'test-flag',
        defaultValue: 0,
        entities: undefined,
        headers: mockHeaders,
        cookies: mockCookies,
      });

      expect(value).toBe(0);
    });
  });

  describe('identity handling', () => {
    it('should identify user when entities are provided', async () => {
      const adapter = flagsmithAdapter.booleanValue();
      const identity: IIdentity = 'test-id';

      vi.mocked(flagsmith.getState).mockReturnValue({
        flags: {
          'test-flag': {
            enabled: true,
            value: 'test-value',
          },
        },
        api: 'https://api.flagsmith.com/api/v1/',
      } as IState<string>);

      await adapter.decide({
        key: 'test-flag',
        defaultValue: false,
        entities: identity,
        headers: mockHeaders,
        cookies: mockCookies,
      });

      expect(flagsmith.identify).toHaveBeenCalledWith(identity);
    });
  });
});
