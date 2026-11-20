import { defineSource } from 'flags';

// A provider which reads the time, as many providers do, e.g. for a retry
// or for metrics. Next.js does not allow Date.now() in a prerender, so the
// evaluation must belong to the render at request time.
// The source of the flags of this app
export const self = defineSource({
  provider: {
    metadata: { name: 'clock' },
    resolveBooleanEvaluation: async () => ({
      value: Date.now() > 0,
      reason: 'STATIC',
    }),
  },
  project: { system: 'in-memory' },
  getEvaluationContext: (request) => ({
    user: request?.cookies?.get('user')?.value ?? 'anonymous',
  }),
});
