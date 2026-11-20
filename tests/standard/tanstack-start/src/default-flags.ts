'use flags';

import { bindFlag } from 'flags';
import { self } from './flags/self';

// The flags of the source of this app (flags/self.ts)
export const greeting = bindFlag({
  key: 'greeting',
  source: self,
  type: 'string',
  defaultValue: 'Hi',
});
export const darkMode = bindFlag({ key: 'dark-mode', source: self });
