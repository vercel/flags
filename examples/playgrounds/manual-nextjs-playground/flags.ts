// flags.ts
'use flags';

import { bindFlag } from 'flags';

export const testBooleanFlag = bindFlag({ key: 'test-boolean' });
export const myTestFlag = bindFlag({
  key: 'my-test-flag',
  description: 'a boolean test flag',
});
