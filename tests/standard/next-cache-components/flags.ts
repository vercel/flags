'use flags';

import { bindFlag } from 'flags';

export const summerSale = bindFlag({ key: 'summer-sale', defaultValue: false });
