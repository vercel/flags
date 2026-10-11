import { redirect } from '@tanstack/react-router';
import { defineConfig, defineConnection } from 'flags';

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
      // A signal of TanStack Start must reach TanStack Start
      if (request?.cookies?.get('blocked')) throw redirect({ to: '/blocked' });
      return { user: request?.cookies?.get('user')?.value ?? 'anonymous' };
    },
  }),
});

declare module 'flags' {
  interface Register {
    config: typeof config;
  }
}
