// flags.ts
'use flags';

import { self } from '@/flags/self';

export const testBooleanFlag = self.bindFlag('test-boolean');
export const myTestFlag = self.bindFlag('my-test-flag', {
  description: 'a boolean test flag',
});
