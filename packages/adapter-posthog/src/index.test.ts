import { expect, it, describe, vi, beforeEach, afterEach } from 'vitest';
import { createPostHogAdapter } from '.';
import posthog from 'posthog-js';

describe('createPostHogAdapter', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should initialize PostHog with the provided API key', () => {
    const apiKey = 'test-api-key';
    createPostHogAdapter(apiKey);
    expect(posthog.init).toHaveBeenCalledWith(apiKey);
  });

  it('should resolve flags correctly', async () => {
    const apiKey = 'test-api-key';
    const adapter = createPostHogAdapter(apiKey);
    const flagKey = 'test-flag';
    const flagValue = true;

    posthog.isFeatureEnabled = vi.fn().mockReturnValue(flagValue);

    const result = await adapter.decide({ key: flagKey });
    expect(result).toBe(flagValue);
    expect(posthog.isFeatureEnabled).toHaveBeenCalledWith(flagKey);
  });
});
