'use flags';

import { InMemoryProvider } from '@openfeature/server-sdk';
import { defineSource } from 'flags';

// Replace InMemoryProvider with your OpenFeature provider for production.
// The SDK calls the provider directly and initializes it before the first
// evaluation, so there is no need for OpenFeature.setProviderAndWait().
const openFeature = defineSource({
  provider: new InMemoryProvider({
    welcome_message: {
      variants: { greeting: 'Hello from OpenFeature' },
      defaultVariant: 'greeting',
      disabled: false,
    },
    show_banner: {
      variants: { on: true, off: false },
      defaultVariant: 'on',
      disabled: false,
    },
  }),
  // A shared demo context keeps this example focused on flag evaluation.
  // It runs once per request for all flags of this source.
  getEvaluationContext: () => ({ targetingKey: 'demo-user' }),
});

export const welcomeMessage = openFeature.bindFlag('welcome_message', {
  type: 'string',
  description: 'The welcome message shown on the home page.',
  defaultValue: 'Welcome to the OpenFeature example',
});

export const showBanner = openFeature.bindFlag('show_banner', {
  description: 'Show the promotional banner on the home page.',
  defaultValue: false,
});
