// flags.config.ts
import { VercelProvider } from '@vercel/flags-core/openfeature';
import { defineConfig, defineSource } from 'flags';

export const config = defineConfig({
  defaultSource: defineSource({
    provider: new VercelProvider(),
    project: { system: 'vercel-flags' },
    getEvaluationContext: (context: { teamSlug: string }, request) => ({}),
  }),
});

// Gives flags without a source the types of this source
declare module 'flags' {
  interface Register {
    config: typeof config;
  }
}
