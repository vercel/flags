import { createFlagsmithAdapter } from '@flags-sdk/flagsmith';
import { flag } from 'flags/next';

const adapter = createFlagsmithAdapter({
  environmentKey: process.env.FLAGSMITH_ENVIRONMENT_KEY ?? '',
});

export const welcomeMessage = flag({
  key: 'welcome_message',
  defaultValue: 'Welcome to the Flagsmith example',
  adapter: adapter.getValue({ coerce: 'string' }),
});

export const showBanner = flag({
  key: 'show_banner',
  defaultValue: false,
  adapter: adapter.getValue({ coerce: 'boolean' }),
});
