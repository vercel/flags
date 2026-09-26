import { type Attributes, growthbookAdapter } from '@flags-sdk/growthbook';
import { flag } from 'flags/next';

// A shared demo context keeps this example focused on flag evaluation.
const identify = (): Attributes => ({ id: 'demo-user' });

export const welcomeMessage = flag<string, Attributes>({
  key: 'welcome_message',
  defaultValue: 'Welcome to the GrowthBook example',
  identify,
  adapter: growthbookAdapter.feature<string>(),
});

export const showBanner = flag<boolean, Attributes>({
  key: 'show_banner',
  defaultValue: false,
  identify,
  adapter: growthbookAdapter.feature<boolean>(),
});
