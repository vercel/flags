import { TypedInMemoryProvider } from '@openfeature/server-sdk';
import { defineSource } from 'flags';

// Counts the calls of getEvaluationContext for each request, so that the
// tests can see the cache of the request. On globalThis, because Next.js
// can load this file in more than one bundle.
const store = globalThis as { __contextCalls?: Map<string, number> };
store.__contextCalls ??= new Map();
const counts = store.__contextCalls;

export function contextCalls(requestId: string): number {
  return counts.get(requestId) ?? 0;
}

// The source of the flags of this app
export const self = defineSource({
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
      contextEvaluator: (context) => (context.user === 'alice' ? 'on' : 'off'),
    },
    'banner-text': {
      variants: { welcome: 'Welcome', sale: 'Summer sale!' },
      defaultVariant: 'sale',
      disabled: false,
    },
  } as const),
  project: { system: 'in-memory' },
  getEvaluationContext: (request) => {
    const id = request?.headers?.get('x-request-id');
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    return {
      user: request?.cookies?.get('user')?.value ?? 'anonymous',
      requestId: id ?? null,
    };
  },
});
