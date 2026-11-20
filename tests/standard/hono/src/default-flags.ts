'use flags';

import { bindFlag } from 'flags';
import { self } from './flags/self.ts';

// The flags of the source of this app (flags/self.ts)
export const newCheckout = bindFlag({ key: 'new-checkout', source: self });
