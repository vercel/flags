'use flags';

import { bindFlag } from 'flags';
import { launchdarkly } from './flags/launchdarkly';

export const welcomeMessage = bindFlag({
  key: 'welcome_message',
  source: launchdarkly,
  type: 'string',
  defaultValue: 'Welcome to the LaunchDarkly example',
});

export const showBanner = bindFlag({
  key: 'show_banner',
  source: launchdarkly,
  defaultValue: false,
});
