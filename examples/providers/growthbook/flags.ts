'use flags';

import { GrowthbookProvider } from '@openfeature/growthbook-provider';
import { defineSource } from 'flags';

const growthbook = defineSource({
  // The OpenFeature provider of GrowthBook. It loads the features before the
  // first evaluation, and refreshes them every 60 seconds.
  provider: new GrowthbookProvider(
    {
      clientKey: process.env.GROWTHBOOK_CLIENT_KEY,
      apiHost: process.env.GROWTHBOOK_API_HOST || 'https://cdn.growthbook.io',
    },
    { pollingInterval: 60_000 },
  ),
  // A shared demo context keeps this example focused on flag evaluation.
  // The provider gives the evaluation context to GrowthBook as attributes.
  getEvaluationContext: () => ({ id: 'demo-user' }),
});

export const welcomeMessage = growthbook.bindFlag('welcome_message', {
  type: 'string',
  defaultValue: 'Welcome to the GrowthBook example',
});

export const showBanner = growthbook.bindFlag('show_banner', {
  defaultValue: false,
});
