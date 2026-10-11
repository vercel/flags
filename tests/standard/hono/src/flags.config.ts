import { defineConfig, defineConnection } from 'flags';
import { HTTPException } from 'hono/http-exception';

export const config = defineConfig({
  defaultConnection: defineConnection({
    provider: {
      metadata: { name: 'app' },
      resolveBooleanEvaluation: async (_key, _defaultValue, context) => ({
        value: context.user === 'alice',
      }),
    },
    project: { system: 'in-memory' },
    getEvaluationContext: (_context, request) => {
      // An HTTPException of Hono must reach Hono
      if (request?.cookies?.get('blocked')) {
        throw new HTTPException(403, { message: 'Blocked' });
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
