import { TypedInMemoryProvider } from '@openfeature/server-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bindFlag } from './flag';
import { runtime } from './runtime';
import { defineSource } from './source';

// OpenFeature requires a default of the correct type, and providers examine
// it. Without defaultValue, the SDK passes false. A provider which returns
// the default then returns false. See "Flags" in the spec.
describe('a flag without defaultValue', () => {
  beforeEach(() => {
    runtime.reset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const source = () =>
    defineSource({
      provider: new TypedInMemoryProvider({
        'old-checkout': {
          variants: { on: true, off: false },
          defaultVariant: 'on',
          disabled: true,
        },
      } as const),
      project: { system: 'in-memory' },
    });

  it('passes false to the provider, because providers examine the type', async () => {
    const provider = {
      metadata: { name: 'test' },
      resolveBooleanEvaluation: vi.fn(
        async (_key: string, _defaultValue: boolean) => ({ value: true }),
      ),
    };
    const flag = bindFlag({
      key: 'a',
      source: defineSource({
        provider,
        project: { system: 'in-memory' },
      }),
    });

    await flag();
    expect(provider.resolveBooleanEvaluation.mock.calls[0]?.[1]).toBe(false);
  });

  it('returns false when the provider returns the default, e.g. for a disabled flag', async () => {
    await expect(
      bindFlag({ key: 'old-checkout', source: source() })(),
    ).resolves.toBe(false);
  });

  it('returns the defaultValue when the provider returns the default', async () => {
    await expect(
      bindFlag({
        key: 'old-checkout',
        defaultValue: true,
        source: source(),
      })(),
    ).resolves.toBe(true);
  });
});

describe('a provider which reports an issue', () => {
  beforeEach(() => {
    runtime.reset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const reportsError = () =>
    defineSource({
      provider: {
        metadata: { name: 'test' },
        // The reason ERROR, but no errorCode
        resolveBooleanEvaluation: async (_key, value) => ({
          value,
          reason: 'ERROR',
        }),
      },
      project: { system: 'in-memory' },
    });

  it('throws for the reason ERROR without an errorCode', async () => {
    await expect(
      bindFlag({ key: 'a', source: reportsError() })(),
    ).rejects.toMatchObject({
      code: 'GENERAL',
      message:
        'flags: Could not evaluate flag "a": The provider reported an error.',
    });
  });

  it('returns the defaultValue for the reason ERROR', async () => {
    await expect(
      bindFlag({
        key: 'a',
        defaultValue: true,
        source: reportsError(),
      })(),
    ).resolves.toBe(true);
  });
});
