import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFlagsmithAdapter } from '.';
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
  });

  afterEach(() => {
    vi.mocked(flagsmith.init).mockClear();
    vi.clearAllMocks();
  });

  it('should initialize the adapter', async () => {
    const adapter = createFlagsmithAdapter({
      environmentID: 'test-key',
    });

    expect(adapter).toBeDefined();
    expect(adapter.decide).toBeDefined();
  });

  it('should initialize Flagsmith client when deciding flag value', async () => {
    const adapter = createFlagsmithAdapter<IFlagsmithFeature, any>({
      environmentID: 'test-key',
    });

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
      environmentID: 'test-key',
      fetch: expect.any(Function),
    });
    expect(value).toEqual(mockFlag);
  });

  it('should return default value when flag is not found', async () => {
    const adapter = createFlagsmithAdapter<IFlagsmithFeature, any>({
      environmentID: 'test-key',
    });

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
    const adapter = createFlagsmithAdapter<IFlagsmithFeature, any>({
      environmentID: 'test-key',
    });

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
    const adapter = createFlagsmithAdapter<IFlagsmithFeature, any>({
      environmentID: 'test-key',
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
      environmentID: 'test-key',
      api: 'https://custom-api.com',
      enableLogs: true,
      fetch: expect.any(Function),
    });
  });
});
