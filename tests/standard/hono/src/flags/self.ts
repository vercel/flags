import { defineSource } from 'flags';
import { HTTPException } from 'hono/http-exception';

// The source of the flags of this app
export const self = defineSource({
  provider: {
    metadata: { name: 'app' },
    resolveBooleanEvaluation: async (_key, _defaultValue, context) => ({
      value: context.user === 'alice',
    }),
  },
  project: { system: 'in-memory' },
  getEvaluationContext: (request) => {
    // An HTTPException of Hono must reach Hono
    if (request?.cookies?.get('blocked')) {
      throw new HTTPException(403, { message: 'Blocked' });
    }
    return { user: request?.cookies?.get('user')?.value ?? 'anonymous' };
  },
});
