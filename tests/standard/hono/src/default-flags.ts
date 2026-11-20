'use flags';

import { bindFlag } from 'flags';

// No source: the flags use the default source of flags/config.ts
export const newCheckout = bindFlag({ key: 'new-checkout' });
