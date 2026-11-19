'use flags';

import { bindFlag } from 'flags';

// No source: the flags use the default source of flags.config.ts
export const newCheckout = bindFlag({ key: 'new-checkout' });
export const greeting = bindFlag({
  key: 'greeting',
  type: 'string',
  defaultValue: 'Hi',
});
