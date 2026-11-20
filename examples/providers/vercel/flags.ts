'use flags';

import { VercelProvider } from '@vercel/flags-core/openfeature';
import { defineSource } from 'flags';

// Without an SDK key, VercelProvider uses the OIDC token of the project, or
// the SDK key in the FLAGS environment variable if you set one.
const vercel = defineSource({
  provider: new VercelProvider(),
  // The flags of the Vercel project of this deployment, for the links of
  // Flags Explorer to the dashboard
  project: { system: 'vercel-flags' },
});

export const welcomeMessage = vercel.bindFlag('welcome_message', {
  type: 'string',
  description: 'The welcome message shown on the home page.',
  defaultValue: 'Welcome to the Vercel example',
});

export const showBanner = vercel.bindFlag('show_banner', {
  description: 'Show the promotional banner on the home page.',
  defaultValue: false,
});
