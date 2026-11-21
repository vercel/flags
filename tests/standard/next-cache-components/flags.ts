'use flags';

import { self } from './flags/self';

export const summerSale = self.bindFlag('summer-sale', {
  defaultValue: false,
});
