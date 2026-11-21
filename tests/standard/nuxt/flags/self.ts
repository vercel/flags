import { defineSource } from 'flags';
import { createError } from '#imports';

// The source of the flags of this app
export const self = defineSource({
  provider: {
    metadata: { name: 'app' },
    resolveBooleanEvaluation: async (_key, _defaultValue, context) => ({
      value: context.user === 'alice',
    }),
    // The hook of flags/hooks.ts marks each evaluation, so the tests
    // see that the binding loaded it
    resolveStringEvaluation: async (_key, _defaultValue, context) => ({
      value:
        context.fromConfig === true
          ? 'Hello from flags/hooks.ts'
          : 'Without flags/hooks.ts',
    }),
  },
  project: { system: 'in-memory' },
  getEvaluationContext: (request) => {
    // A signal of Nitro must reach Nitro
    if (request?.cookies?.get('blocked')) {
      throw createError({ statusCode: 403, statusMessage: 'Blocked' });
    }
    return { user: request?.cookies?.get('user')?.value ?? 'anonymous' };
  },
});
