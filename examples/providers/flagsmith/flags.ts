'use flags';

import { bindFlag } from 'flags';
import { flagsmith } from './flags/flagsmith';

export const welcomeMessage = bindFlag({
  key: 'welcome_message',
  source: flagsmith,
  type: 'string',
  defaultValue: 'Welcome to the Flagsmith example',
});

export const showBanner = bindFlag({
  key: 'show_banner',
  source: flagsmith,
  defaultValue: false,
});
