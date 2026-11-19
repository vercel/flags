import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runtime } from './runtime';
import { defineSource } from './source';
import { track } from './track';
import type { Provider } from './types';

function createSource() {
  const provider = {
    metadata: { name: 'tracking' },
    initialize: vi.fn(async () => {}),
    resolveBooleanEvaluation: async () => ({ value: true }),
    track: vi.fn(),
  } satisfies Provider;
  return defineSource({
    provider,
    project: { system: 'in-memory' },
    getEvaluationContext: (context: { userId: string }, request) => ({
      user: context.userId,
      country: request?.headers?.get('x-country') ?? null,
    }),
  });
}

beforeEach(() => {
  runtime.reset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('track', () => {
  it('gives the event to the provider with the context of the source', async () => {
    const source = createSource();
    const request = new Request('https://shop.example', {
      headers: { 'x-country': 'CH' },
    });

    await runtime.onInvoke(request, () =>
      track(source, 'purchase', {
        evaluationContext: { userId: 'alice' },
        details: { value: 99, currency: 'CHF' },
      }),
    );
    expect(source.provider.initialize).toHaveBeenCalledTimes(1);
    expect(source.provider.track).toHaveBeenCalledWith(
      'purchase',
      { user: 'alice', country: 'CH' },
      { value: 99, currency: 'CHF' },
    );
  });

  it('requires the context which the source requires', () => {
    const source = createSource();
    void (() => {
      // @ts-expect-error the source requires { userId }
      track(source, 'purchase');
    });
  });

  it('uses the default source', async () => {
    const source = createSource();
    runtime.configure({ defaultSource: source });

    await track('signup', { evaluationContext: { userId: 'bob' } });
    expect(source.provider.track).toHaveBeenCalledWith(
      'signup',
      { user: 'bob', country: null },
      {},
    );
  });

  it('ignores the event for a provider without track', async () => {
    const provider: Provider = {
      metadata: { name: 'no-tracking' },
      resolveBooleanEvaluation: async () => ({ value: true }),
    };
    const source = defineSource({
      provider,
      project: { system: 'in-memory' },
    });

    await expect(track(source, 'purchase')).resolves.toBeUndefined();
  });

  it('logs errors and does not throw', async () => {
    const source = createSource();
    source.provider.track.mockImplementation(() => {
      throw new Error('Offline');
    });

    await expect(
      track(source, 'purchase', { evaluationContext: { userId: 'a' } }),
    ).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(
      'flags: Could not track event "purchase".',
      expect.any(Error),
    );
  });

  it('requires a source returned by defineSource', () => {
    expect(() =>
      // @ts-expect-error a number is not a source
      track(1, 'purchase'),
    ).toThrow(
      'flags: track expects an event name, or a source and an event name.',
    );
  });
});
