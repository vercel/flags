import { TypedInMemoryProvider } from '@openfeature/server-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineConnection } from './connection';
import { defineFlag } from './flag';
import { createOfrepProvider } from './ofrep';
import { runtime } from './runtime';

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

  const connection = () =>
    defineConnection({
      provider: new TypedInMemoryProvider({
        'old-checkout': {
          variants: { on: true, off: false },
          defaultVariant: 'on',
          disabled: true,
        },
      } as const),
      project: { platform: 'in-memory' },
    });

  it('passes false to the provider, because providers examine the type', async () => {
    const provider = {
      metadata: { name: 'test' },
      resolveBooleanEvaluation: vi.fn(
        async (_key: string, _defaultValue: boolean) => ({ value: true }),
      ),
    };
    const flag = defineFlag({
      key: 'a',
      connection: defineConnection({
        provider,
        project: { platform: 'in-memory' },
      }),
    });

    await flag();
    expect(provider.resolveBooleanEvaluation.mock.calls[0]?.[1]).toBe(false);
  });

  it('returns false when the provider returns the default, e.g. for a disabled flag', async () => {
    await expect(
      defineFlag({ key: 'old-checkout', connection: connection() })(),
    ).resolves.toBe(false);
  });

  it('returns the defaultValue when the provider returns the default', async () => {
    await expect(
      defineFlag({
        key: 'old-checkout',
        defaultValue: true,
        connection: connection(),
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
    defineConnection({
      provider: {
        metadata: { name: 'test' },
        // The reason ERROR, but no errorCode
        resolveBooleanEvaluation: async (_key, value) => ({
          value,
          reason: 'ERROR',
        }),
      },
      project: { platform: 'in-memory' },
    });

  it('throws for the reason ERROR without an errorCode', async () => {
    await expect(
      defineFlag({ key: 'a', connection: reportsError() })(),
    ).rejects.toMatchObject({
      code: 'GENERAL',
      message:
        'flags: Could not evaluate flag "a": The provider reported an error.',
    });
  });

  it('returns the defaultValue for the reason ERROR', async () => {
    await expect(
      defineFlag({
        key: 'a',
        defaultValue: true,
        connection: reportsError(),
      })(),
    ).resolves.toBe(true);
  });

  describe('OFREP without a value: the default of the code', () => {
    const ofrep = () =>
      defineConnection({
        provider: createOfrepProvider({
          baseUrl: 'https://flags.example.com',
          fetch: async () => Response.json({ key: 'a', reason: 'DEFAULT' }),
        }),
        project: { platform: 'in-memory' },
      });

    it('throws without defaultValue', async () => {
      await expect(
        defineFlag({ key: 'a', connection: ofrep() })(),
      ).rejects.toMatchObject({
        message:
          'flags: Could not evaluate flag "a": The provider asks for the default value, but the flag has no defaultValue.',
      });
    });

    it('returns the defaultValue', async () => {
      await expect(
        defineFlag({ key: 'a', defaultValue: true, connection: ofrep() })(),
      ).resolves.toBe(true);
    });
  });
});
