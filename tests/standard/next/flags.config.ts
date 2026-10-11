import { TypedInMemoryProvider } from '@openfeature/server-sdk';
import { defineConfig, defineConnection } from 'flags';

// Counts the calls of getEvaluationContext and the evaluations for each
// request, so that the tests can see the caches of the request. On
// globalThis, because Next.js can load this file in more than one bundle.
const store = globalThis as {
  __contextCalls?: Map<string, number>;
  __evaluations?: Map<string, number>;
};
store.__contextCalls ??= new Map();
store.__evaluations ??= new Map();
const counts = store.__contextCalls;
const evaluations = store.__evaluations;

export function contextCalls(requestId: string): number {
  return counts.get(requestId) ?? 0;
}

export function evaluationCount(requestId: string): number {
  return evaluations.get(requestId) ?? 0;
}

const appConfig = defineConfig({
  hooks: [
    {
      after(hookContext) {
        const id = hookContext.context.requestId;
        if (typeof id === 'string') {
          evaluations.set(id, (evaluations.get(id) ?? 0) + 1);
        }
      },
    },
  ],
  defaultConnection: defineConnection({
    provider: new TypedInMemoryProvider({
      'summer-sale': {
        variants: { on: true, off: false },
        defaultVariant: 'on',
        disabled: false,
      },
      'new-checkout': {
        variants: { on: true, off: false },
        defaultVariant: 'off',
        disabled: false,
        // On for alice only
        contextEvaluator: (context) =>
          context.user === 'alice' ? 'on' : 'off',
      },
      'banner-text': {
        variants: { welcome: 'Welcome', sale: 'Summer sale!' },
        defaultVariant: 'sale',
        disabled: false,
      },
    } as const),
    project: { platform: 'in-memory' },
    getEvaluationContext: (_context, request) => {
      const id = request?.headers?.get('x-request-id');
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
      return {
        user: request?.cookies?.get('user')?.value ?? 'anonymous',
        requestId: id ?? null,
      };
    },
  }),
});

// The platform variant has no default connection, so the flags use the
// default provider, which the adapter of the platform replaces
export const config =
  process.env.TEST_VARIANT === 'platform' ? defineConfig({}) : appConfig;

declare module 'flags' {
  interface Register {
    config: typeof config;
  }
}
