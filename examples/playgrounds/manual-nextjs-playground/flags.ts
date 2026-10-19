// flags.ts
'use flags';

import { defineFlag } from 'flags';

export const testBooleanFlag = defineFlag('test-boolean');
export const myTestFlag = defineFlag({
  key: 'my-test-flag',
  description: 'a boolean test flag',
});
