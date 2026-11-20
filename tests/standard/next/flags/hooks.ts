import type { Hook } from 'flags';

// Counts the evaluations for each request, so that the tests can see the
// cache of the request. On globalThis, because Next.js can load this file
// in more than one bundle.
const store = globalThis as { __evaluations?: Map<string, number> };
store.__evaluations ??= new Map();
const evaluations = store.__evaluations;

export function evaluationCount(requestId: string): number {
  return evaluations.get(requestId) ?? 0;
}

// Optional: the hooks for all flags, as the default export
const hooks: Hook[] = [
  {
    after(hookContext) {
      const id = hookContext.context.requestId;
      if (typeof id === 'string') {
        evaluations.set(id, (evaluations.get(id) ?? 0) + 1);
      }
    },
  },
];

export default hooks;
