'use flags';

import { flagsmith } from './flags/flagsmith';

export const welcomeMessage = flagsmith.bindFlag('welcome_message', {
  type: 'string',
  defaultValue: 'Welcome to the Flagsmith example',
});

export const showBanner = flagsmith.bindFlag('show_banner', {
  defaultValue: false,
});
