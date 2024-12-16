import { flag, dedupe } from '@vercel/flags/next';
import { launchDarkly, type LDContext } from '@flags-sdk/launchdarkly';

const ldIdentify = dedupe(async (): Promise<LDContext> => {
  return {
    key: 'uid1',
  };
});

export const winterSaleLanchDarkly = flag<boolean, LDContext>({
  key: 'winter-sale-ld',
  identify: ldIdentify,
  adapter: launchDarkly(),
});

export const precomputeFlags = [winterSaleLanchDarkly] as const;
