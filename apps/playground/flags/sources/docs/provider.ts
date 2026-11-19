import { createClient } from '@vercel/flags-core';
import { VercelProvider } from '@vercel/flags-core/openfeature';

// The OpenFeature provider of Vercel Flags. Without an SDK key, the client
// uses the OIDC token of the project, e.g. after vercel env pull.
export default new VercelProvider(
  createClient({ clientName: 'flags-playground' }),
);
