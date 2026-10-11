import { redirect } from '@sveltejs/kit';
import { defineConfig, defineConnection } from 'flags';

const appConfig = defineConfig({
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
      // A signal of SvelteKit must reach SvelteKit
      if (request?.cookies?.get('blocked')) redirect(307, '/blocked');
      return { user: request?.cookies?.get('user')?.value ?? 'anonymous' };
    },
  }),
});

// The platform variant has no default connection, so the flags use the
// default provider, which the plugin replaces with the one of the platform
export const config =
  process.env.TEST_VARIANT === 'platform' ? defineConfig({}) : appConfig;

declare module 'flags' {
  interface Register {
    config: typeof config;
  }
}
