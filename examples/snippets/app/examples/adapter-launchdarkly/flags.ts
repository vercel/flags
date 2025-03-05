import { flag } from 'flags/next';
import { launchDarkly } from '@flags-sdk/launchdarkly';

export const exampleFlag = flag({
  key: 'launchdarkly-adapter-example-flag',
  defaultValue: false,
  description: 'Whether the summer sale is active',
  adapter: launchDarkly(),
  async identify() {
    return { key: 'uid1' };
  },
});
