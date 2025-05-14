import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flagsmithAdapter } from '.';
import flagsmith, { IFlagsmithFeature, IState } from 'flagsmith';

// Mock the flagsmith module
vi.mock('flagsmith', () => ({
  default: {
    init: vi.fn(),
    getState: vi.fn(),
    initialised: false,
  },
}));

describe('Flagsmith Adapter', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.FLAGSMITH_ENVIRONMENT_ID = 'test-key';
  });

  afterEach(() => {
    vi.mocked(flagsmith.init).mockClear();
    delete process.env.FLAGSMITH_ENVIRONMENT_ID;
    vi.clearAllMocks();
  });

  it('should initialize the adapter', async () => {
    const adapter = flagsmithAdapter.getFeature();

    expect(adapter).toBeDefined();
    expect(adapter.decide).toBeDefined();
  });

  it('should initialize Flagsmith client when deciding flag value', async () => {
    const adapter = flagsmithAdapter.getFeature();

    // Mock getState to return a specific flag value
    const mockFlag: IFlagsmithFeature = {
      enabled: true,
      value: 'test-value',
    };

    vi.mocked(flagsmith.getState).mockReturnValue({
      flags: {
        'test-flag': mockFlag,
      },
      api: 'https://api.flagsmith.com/api/v1/',
    } as IState<string>);

    const value = await adapter.decide({
      key: 'test-flag',
      defaultValue: mockFlag,
      entities: undefined,
      headers: {} as any,
      cookies: {} as any,
    });

    expect(flagsmith.init).toHaveBeenCalledWith({
      fetch: expect.any(Function),
      environmentID: process.env.FLAGSMITH_ENVIRONMENT_ID,
    });
    expect(value).toEqual(mockFlag);
  });

  it('should return default value when flag is not found', async () => {
    const adapter = flagsmithAdapter.getFeature();

    // Mock getState to return empty flags
    vi.mocked(flagsmith.getState).mockReturnValue({
      flags: {},
      api: 'https://api.flagsmith.com/api/v1/',
    } as IState<string>);

    const defaultValue: IFlagsmithFeature = {
      enabled: false,
      value: 'default',
    };

    const value = await adapter.decide({
      key: 'non-existent-flag',
      defaultValue,
      entities: undefined,
      headers: {} as any,
      cookies: {} as any,
    });

    expect(value).toEqual(defaultValue);
  });

  it('should reuse initialized Flagsmith client', async () => {
    const adapter = flagsmithAdapter.getFeature();

    // Set Flagsmith as already initialized
    vi.mocked(flagsmith).initialised = true;

    const defaultValue: IFlagsmithFeature = {
      enabled: false,
      value: 'default',
    };

    await adapter.decide({
      key: 'test-flag',
      defaultValue,
      entities: undefined,
      headers: {} as any,
      cookies: {} as any,
    });

    expect(flagsmith.init).not.toHaveBeenCalled();
  });

  it('should handle additional Flagsmith configuration options', async () => {
    const adapter = flagsmithAdapter.getFeature({
      api: 'https://custom-api.com',
      enableLogs: true,
    });

    vi.mocked(flagsmith).initialised = false;

    await adapter.decide({
      key: 'test-flag',
      entities: undefined,
      headers: {} as any,
      cookies: {} as any,
    });

    expect(flagsmith.init).toHaveBeenCalledWith({
      api: 'https://custom-api.com',
      enableLogs: true,
      environmentID: process.env.FLAGSMITH_ENVIRONMENT_ID,
      fetch: expect.any(Function),
    });
  });

  it('should handle manually set environmentID', async () => {
    const adapter = flagsmithAdapter.getFeature({
      environmentID: 'custom-env-id',
    });

    vi.mocked(flagsmith).initialised = false;

    await adapter.decide({
      key: 'test-flag',
      entities: undefined,
      headers: {} as any,
      cookies: {} as any,
    });

    expect(flagsmith.init).toHaveBeenCalledWith({
      environmentID: 'custom-env-id',
      fetch: expect.any(Function),
    });
  });

  it('should retrieve the feature flag value using the decide method', async () => {
    const mockFlag: IFlagsmithFeature = {
      enabled: true,
      value: 'mocked-value',
    };

    vi.mocked(flagsmith.getState).mockReturnValue({
      flags: {
        'my-feature': mockFlag,
      },
      api: 'https://api.flagsmith.com/api/v1/',
    } as IState<string>);

    // Mock Flagsmith as not initialized
    vi.mocked(flagsmith).initialised = false;

    const adapter = flagsmithAdapter.getFeature();

    const myFeatureFlag = await adapter.decide({
      key: 'my-feature',
      defaultValue: { enabled: false, value: 'default-value' },
      entities: undefined,
      headers: {} as any,
      cookies: {} as any,
    });

    expect(flagsmith.init).toHaveBeenCalledWith({
      environmentID: process.env.FLAGSMITH_ENVIRONMENT_ID,
      fetch: expect.any(Function),
    });
    expect(myFeatureFlag).toEqual(mockFlag);
  });
});
