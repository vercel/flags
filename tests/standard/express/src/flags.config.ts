import { defineConfig, defineConnection } from 'flags';

export const config = defineConfig({
  defaultConnection: defineConnection({
    provider: {
      metadata: { name: 'app' },
      resolveBooleanEvaluation: async (_key, _defaultValue, context) => ({
        value: context.user === 'alice',
      }),
    },
    project: { system: 'in-memory' },
    getEvaluationContext: (_context, request) => ({
      user: request?.cookies?.get('user')?.value ?? 'anonymous',
      path: request?.url?.pathname ?? null,
    }),
  }),
});

declare module 'flags' {
  interface Register {
    config: typeof config;
  }
}
