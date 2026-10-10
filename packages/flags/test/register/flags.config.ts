import { defineConfig, defineConnection } from 'flags';

// The pattern of flags.config.ts: the configuration and the registration of
// its type in one file
export const config = defineConfig({
  defaultConnection: defineConnection({
    provider: {
      metadata: { name: 'test' },
      resolveBooleanEvaluation: async () => ({ value: true }),
    },
    project: { platform: 'in-memory' },
    getEvaluationContext: (context: { teamId: string }) => ({
      team: context.teamId,
    }),
  }),
});

declare module 'flags' {
  interface Register {
    config: typeof config;
  }
}
