import { flag } from '@vercel/flags/next';
import { launchDarkly } from '@flags-sdk/launchdarkly';

export const summerSaleFlag = flag({
  key: 'summer-sale',
  defaultValue: false,
  description: 'Whether the summer sale is active',
  adapter: launchDarkly(),
  async identify() {
    return { key: 'uid1' };
  },
});
