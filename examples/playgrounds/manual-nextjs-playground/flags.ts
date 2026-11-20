// flags.ts
'use flags';

import { bindFlag } from 'flags';
import { self } from '@/flags/self';

export const testBooleanFlag = bindFlag({ key: 'test-boolean', source: self });
export const myTestFlag = bindFlag({
  key: 'my-test-flag',
  source: self,
  description: 'a boolean test flag',
});
