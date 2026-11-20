import { VercelProvider } from '@vercel/flags-core/openfeature';
import { defineSource } from 'flags';

// The source of the flags in flags.ts: Vercel Flags, through its
// OpenFeature provider
export const self = defineSource({
  provider: new VercelProvider(),
  project: { system: 'vercel-flags' },
  getEvaluationContext: () => ({}),
});
