import { type Context, reflagAdapter } from '@flags-sdk/reflag';
import { flag } from 'flags/next';

// A shared demo company keeps this example focused on flag evaluation.
const identify = (): Context => ({ company: { id: 'demo-company' } });

export const welcomeMessage = flag<boolean, Context>({
  key: 'welcome_message',
  defaultValue: false,
  identify,
  adapter: reflagAdapter.isEnabled(),
});

export const showBanner = flag<boolean, Context>({
  key: 'show_banner',
  defaultValue: false,
  identify,
  adapter: reflagAdapter.isEnabled(),
});
