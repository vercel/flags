import { flag, dedupe } from '@vercel/flags/next';
import { launchDarkly, type LDContext } from '@flags-sdk/launchdarkly';

const identify = dedupe(async (): Promise<LDContext> => {
  return {
    key: 'uid1',
  };
});

export const showLaunchDarklyBanner = flag<boolean, LDContext>({
  key: 'show-ld-banner',
  identify,
  adapter: launchDarkly(),
});
