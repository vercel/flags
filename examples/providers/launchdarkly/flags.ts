'use flags';

import { launchdarkly } from './flags/launchdarkly';

export const welcomeMessage = launchdarkly.bindFlag('welcome_message', {
  type: 'string',
  defaultValue: 'Welcome to the LaunchDarkly example',
});

export const showBanner = launchdarkly.bindFlag('show_banner', {
  defaultValue: false,
});
