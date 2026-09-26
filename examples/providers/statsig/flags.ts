import { type StatsigUser, statsigAdapter } from '@flags-sdk/statsig';
import { flag } from 'flags/next';

// A shared demo context keeps this example focused on flag evaluation.
const identify = (): StatsigUser => ({ userID: 'demo-user' });

export const welcomeMessage = flag<string, StatsigUser>({
  key: 'welcome_message',
  description: 'The welcome message shown on the home page.',
  defaultValue: 'Welcome to the Statsig example',
  identify,
  adapter: statsigAdapter.dynamicConfig((config) =>
    config.get('message', 'Welcome to the Statsig example'),
  ),
});

export const showBanner = flag<boolean, StatsigUser>({
  key: 'show_banner',
  description: 'Show the promotional banner on the home page.',
  defaultValue: false,
  identify,
  adapter: statsigAdapter.featureGate((gate) => gate.value),
});
