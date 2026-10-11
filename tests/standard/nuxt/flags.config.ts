import { defineConfig, defineConnection } from 'flags';
import { createError } from '#imports';

export const config = defineConfig({
  defaultConnection: defineConnection({
    provider: {
      metadata: { name: 'app' },
      resolveBooleanEvaluation: async (_key, _defaultValue, context) => ({
        value: context.user === 'alice',
      }),
      resolveStringEvaluation: async () => ({
        value: 'Hello from flags.config.ts',
      }),
    },
    project: { system: 'in-memory' },
    getEvaluationContext: (_context, request) => {
      // A signal of Nitro must reach Nitro
      if (request?.cookies?.get('blocked')) {
        throw createError({ statusCode: 403, statusMessage: 'Blocked' });
      }
      return { user: request?.cookies?.get('user')?.value ?? 'anonymous' };
    },
  }),
});

declare module 'flags' {
  interface Register {
    config: typeof config;
  }
}
