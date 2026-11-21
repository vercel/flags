import { redirect } from '@tanstack/react-router';
import { defineSource } from 'flags';

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
    // A signal of TanStack Start must reach TanStack Start
    if (request?.cookies?.get('blocked')) throw redirect({ to: '/blocked' });
    return { user: request?.cookies?.get('user')?.value ?? 'anonymous' };
  },
});
