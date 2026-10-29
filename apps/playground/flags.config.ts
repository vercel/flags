import { defineConnection } from './flags/connection.ts';
import { vercel } from './flags/vercel.ts';

export const connections = {
  site: defineConnection({
    // OIDC selects the linked Vercel project and environment.
    provider: vercel(),
    async getEvaluationContext({ cookies }) {
      const id = cookies.get('demo-visitor')?.value ?? 'visitor-1';
      return {
        user: { id },
        visitor: { id },
      };
    },
  }),
};
