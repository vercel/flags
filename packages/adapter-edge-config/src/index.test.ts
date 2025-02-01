import { expect, it, describe, beforeEach, afterEach } from 'vitest';
import {
  createHappyKitAdapter,
  happyKitAdapter,
  resetDefaultHappyKitAdapter,
} from '.';

describe('createHappyKitAdapter', () => {
  it('should work', () => {
    const adapter = createHappyKitAdapter({
      endpoint: 'https://example.com',
      envKey: 'flags_pub_production_0000',
    });

    expect(adapter).toBeDefined();
  });
});

describe('happyKitAdapter', () => {
  beforeEach(() => {
    process.env.HAPPYKIT_ENDPOINT = 'https://example.com';
    process.env.HAPPYKIT_ENV_KEY = 'flags_pub_production_0000';
  });

  afterEach(() => {
    resetDefaultHappyKitAdapter();
    delete process.env.HAPPYKIT_ENDPOINT;
    delete process.env.HAPPYKIT_ENV_KEY;
  });

  it('should work', () => {
    const adapter = happyKitAdapter();
    expect(adapter).toBeDefined();
  });
});
