import { defineConfig, defineConnection } from 'flags';

// A provider which reads the time, as many providers do, e.g. for a retry
// or for metrics. Next.js does not allow Date.now() in a prerender, so the
// evaluation must belong to the render at request time.
export const config = defineConfig({
  defaultConnection: defineConnection({
    provider: {
      metadata: { name: 'clock' },
      resolveBooleanEvaluation: async () => ({
        value: Date.now() > 0,
        reason: 'STATIC',
      }),
    },
    project: { system: 'in-memory' },
    getEvaluationContext: (_context, request) => ({
      user: request?.cookies?.get('user')?.value ?? 'anonymous',
    }),
  }),
});

declare module 'flags' {
  interface Register {
    config: typeof config;
  }
}
