import { type PostHogEntities, postHogAdapter } from '@flags-sdk/posthog';
import { flag } from 'flags/next';

// A shared demo user keeps this example focused on flag evaluation.
const identify = (): PostHogEntities => ({ distinctId: 'demo-user' });

export const welcomeMessage = flag<string, PostHogEntities>({
  key: 'welcome_message',
  description: 'The welcome message shown on the home page.',
  defaultValue: 'Welcome to the PostHog example',
  identify,
  adapter: postHogAdapter.payload,
});

export const showBanner = flag<boolean, PostHogEntities>({
  key: 'show_banner',
  description: 'Show the promotional banner on the home page.',
  defaultValue: false,
  identify,
  adapter: postHogAdapter,
});
