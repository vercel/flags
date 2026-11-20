import { redirect } from '@sveltejs/kit';
import { defineSource } from 'flags';

// The source of the flags of this app
export const self = defineSource({
  provider: {
    metadata: { name: 'app' },
    resolveBooleanEvaluation: async (_key, _defaultValue, context) => ({
      value: context.user === 'alice',
    }),
    // The hook of flags/config.ts marks each evaluation, so the tests
    // see that the binding loaded it
    resolveStringEvaluation: async (_key, _defaultValue, context) => ({
      value:
        context.fromConfig === true
          ? 'Hello from flags/config.ts'
          : 'Without flags/config.ts',
    }),
  },
  project: { system: 'in-memory' },
  getEvaluationContext: (request) => {
    // A signal of SvelteKit must reach SvelteKit
    if (request?.cookies?.get('blocked')) redirect(307, '/blocked');
    return { user: request?.cookies?.get('user')?.value ?? 'anonymous' };
  },
});
