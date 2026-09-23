import { type LDContext, ldAdapter } from '@flags-sdk/launchdarkly';
import { flag } from 'flags/next';

// Skip provider initialization when running without LaunchDarkly credentials.
const useLaunchDarkly = Boolean(process.env.EXPERIMENTATION_CONFIG);
const defaultMessage = 'Welcome to the LaunchDarkly example';

// A shared demo context keeps this example focused on flag evaluation.
const identify = (): LDContext => ({ kind: 'user', key: 'demo-user' });

export const welcomeMessage = flag<string, LDContext>({
  key: 'welcome_message',
  defaultValue: defaultMessage,
  identify,
  adapter: useLaunchDarkly
    ? ldAdapter.variation()
    : { decide: () => defaultMessage },
});

export const showBanner = flag<boolean, LDContext>({
  key: 'show_banner',
  defaultValue: false,
  identify,
  adapter: useLaunchDarkly ? ldAdapter.variation() : { decide: () => false },
});
