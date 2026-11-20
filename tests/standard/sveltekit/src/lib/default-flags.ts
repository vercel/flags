'use flags';

import { bindFlag } from 'flags';
import { self } from '../flags/self';

// The flags of the source of this app (flags/self.ts)
export const newCheckout = bindFlag({ key: 'new-checkout', source: self });
export const greeting = bindFlag({
  key: 'greeting',
  source: self,
  type: 'string',
  defaultValue: 'Hi',
});
