'use flags';

import { self } from './flags/self';

// The flags of the source of this app (flags/self.ts)
export const greeting = self.bindFlag('greeting', {
  type: 'string',
  defaultValue: 'Hi',
});
export const darkMode = self.bindFlag('dark-mode');
