'use flags';

import { StatsigProvider } from '@flags-sdk/statsig/openfeature';
import { defineSource } from 'flags';

const statsig = defineSource({
  // The OpenFeature provider of @flags-sdk/statsig, on the Statsig Server
  // Core SDK. Creating it does not open a connection: it fetches the rules
  // before the first evaluation, and syncs them in the background.
  provider: new StatsigProvider(process.env.STATSIG_SERVER_API_KEY ?? ''),
  // A shared demo context keeps this example focused on flag evaluation.
  // It runs once per request for all flags of this source. The provider
  // gives `targetingKey` to Statsig as the userID.
  getEvaluationContext: () => ({ targetingKey: 'demo-user' }),
});

// The `text` parameter of the dynamic config `welcome_message_text`
export const welcomeMessage = statsig.bindFlag(
  'config:welcome_message_text.text',
  {
    type: 'string',
    description: 'The welcome message shown on the home page.',
    defaultValue: 'Welcome to the Statsig example',
  },
);

// The feature gate `show_banner`
export const showBanner = statsig.bindFlag('show_banner', {
  description: 'Show the promotional banner on the home page.',
  defaultValue: false,
});
