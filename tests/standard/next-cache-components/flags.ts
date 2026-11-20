'use flags';

import { bindFlag } from 'flags';
import { self } from './flags/self';

export const summerSale = bindFlag({
  key: 'summer-sale',
  source: self,
  defaultValue: false,
});
