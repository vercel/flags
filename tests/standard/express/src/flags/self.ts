import { defineSource } from 'flags';

// The source of the flags of this app
export const self = defineSource({
  provider: {
    metadata: { name: 'app' },
    resolveBooleanEvaluation: async (_key, _defaultValue, context) => ({
      value: context.user === 'alice',
    }),
  },
  project: { system: 'in-memory' },
  getEvaluationContext: (request) => ({
    user: request?.cookies?.get('user')?.value ?? 'anonymous',
    path: request?.url?.pathname ?? null,
  }),
});
