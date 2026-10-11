import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineConnection } from './connection';
import { runtime } from './runtime';
import { track } from './track';
import type { Provider } from './types';

function createConnection() {
  const provider = {
    metadata: { name: 'tracking' },
    initialize: vi.fn(async () => {}),
    resolveBooleanEvaluation: async () => ({ value: true }),
    track: vi.fn(),
  } satisfies Provider;
  return defineConnection({
    provider,
    project: { platform: 'in-memory' },
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
  it('gives the event to the provider with the context of the connection', async () => {
    const connection = createConnection();
    const request = new Request('https://shop.example', {
      headers: { 'x-country': 'CH' },
    });

    await runtime.onInvoke(request, () =>
      track(connection, 'purchase', {
        evaluationContext: { userId: 'alice' },
        details: { value: 99, currency: 'CHF' },
      }),
    );
    expect(connection.provider.initialize).toHaveBeenCalledTimes(1);
    expect(connection.provider.track).toHaveBeenCalledWith(
      'purchase',
      { user: 'alice', country: 'CH' },
      { value: 99, currency: 'CHF' },
    );
  });

  it('requires the context which the connection requires', () => {
    const connection = createConnection();
    void (() => {
      // @ts-expect-error the connection requires { userId }
      track(connection, 'purchase');
    });
  });

  it('uses the default connection', async () => {
    const connection = createConnection();
    runtime.configure({ defaultConnection: connection });

    await track('signup', { evaluationContext: { userId: 'bob' } });
    expect(connection.provider.track).toHaveBeenCalledWith(
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
    const connection = defineConnection({
      provider,
      project: { platform: 'in-memory' },
    });

    await expect(track(connection, 'purchase')).resolves.toBeUndefined();
  });

  it('logs errors and does not throw', async () => {
    const connection = createConnection();
    connection.provider.track.mockImplementation(() => {
      throw new Error('Offline');
    });

    await expect(
      track(connection, 'purchase', { evaluationContext: { userId: 'a' } }),
    ).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(
      'flags: Could not track event "purchase".',
      expect.any(Error),
    );
  });

  it('requires a connection returned by defineConnection', () => {
    expect(() =>
      // @ts-expect-error a number is not a connection
      track(1, 'purchase'),
    ).toThrow(
      'flags: track expects an event name, or a connection and an event name.',
    );
  });
});
