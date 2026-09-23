import { type LDContext, ldAdapter } from '@flags-sdk/launchdarkly';
import { flag } from 'flags/next';

// A shared demo context keeps this example focused on flag evaluation.
const identify = (): LDContext => ({ kind: 'user', key: 'demo-user' });

export const welcomeMessage = flag<string, LDContext>({
  key: 'welcome_message',
  defaultValue: 'Welcome to the LaunchDarkly example',
  identify,
  adapter: ldAdapter.variation(),
});

export const showBanner = flag<boolean, LDContext>({
  key: 'show_banner',
  defaultValue: false,
  identify,
  adapter: ldAdapter.variation(),
});
