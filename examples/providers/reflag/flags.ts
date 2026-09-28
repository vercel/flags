import { type Context, reflagAdapter } from '@flags-sdk/reflag';
import { flag } from 'flags/next';

// A shared demo company keeps this example focused on flag evaluation.
const identify = (): Context => ({ company: { id: 'demo-company' } });

export const welcomeMessage = flag<boolean, Context>({
  key: 'welcome_message',
  description: 'Show the personalized welcome heading on the home page.',
  defaultValue: false,
  identify,
  adapter: reflagAdapter.isEnabled(),
});

export const showBanner = flag<boolean, Context>({
  key: 'show_banner',
  description: 'Show the promotional banner on the home page.',
  defaultValue: false,
  identify,
  adapter: reflagAdapter.isEnabled(),
});
