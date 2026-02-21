import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The readBundledDefinitions function uses dynamic import which is hard to mock.
// Instead, we test the behavior indirectly through the Controller
// which already mocks readBundledDefinitions.
// Here we just test the function interface and basic behavior.

describe('readBundledDefinitions', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should be a function that returns a promise', async () => {
    const { readBundledDefinitions } = await import(
      './read-bundled-definitions'
    );

    // The function should exist and return a promise
    expect(typeof readBundledDefinitions).toBe('function');

    // Calling it should return a promise (will likely fail since the module doesn't exist)
    const result = readBundledDefinitions('test-id');
    expect(result).toBeInstanceOf(Promise);

    // The result should have the expected shape
    const resolved = await result;
    expect(resolved).toHaveProperty('state');
    expect(resolved).toHaveProperty('definitions');
  });

  it('should return missing-file or unexpected-error when module does not exist', async () => {
    const { readBundledDefinitions } = await import(
      './read-bundled-definitions'
    );

    const result = await readBundledDefinitions('nonexistent-id');

    // Since @vercel/flags-definitions/definitions.json doesn't exist in test env,
    // it should return either missing-file or unexpected-error
    expect(['missing-file', 'unexpected-error']).toContain(result.state);
    expect(result.definitions).toBeNull();
  });

  // The detailed behavior of readBundledDefinitions is tested indirectly
  // through Controller tests which mock readBundledDefinitions.
  // Those tests cover:
  // - 'ok' state with bundled definitions
  // - 'missing-file' state
  // - 'missing-entry' state
  // - 'unexpected-error' state
  // - Build step warning behavior
});
