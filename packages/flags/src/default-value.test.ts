import { TypedInMemoryProvider } from '@openfeature/server-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineConnection } from './connection';
import { defineFlag } from './flag';
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
