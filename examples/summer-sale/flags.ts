import { flag, dedupe } from '@vercel/flags/next';
import { getOrGenerateVisitorId } from './utils/generateVisitorId';

const identify = dedupe(async () => {
  return {
    visitor: { id: (await getOrGenerateVisitorId()).value },
    user: {
      vercelian: true,
      id: 'uid1',
      authenticated: true,
      teamIds: ['team1'],
    },
  };
});

export const showSummerBannerFlag = flag<boolean, any>({
  key: 'summer-sale',
  identify,
  decide: async () => {
    return false;
  },
});

export const showFreeDeliveryBannerFlag = flag<boolean>({
  key: 'free-delivery',
  identify,
  async decide() {
    return true;
  },
  origin:
    'https://app.launchdarkly.com/toggle-runner-demo/production/features/free-delivery/targeting',
  description: 'Show free delivery banner',
  defaultValue: true,
  options: [
    { value: false, label: 'Hide' },
    { value: true, label: 'Show' },
  ],
});

export const countryFlag = flag({
  key: 'country',
  async decide({ headers }) {
    return headers.get('accept-language') || 'no accept-lanugage header';
  },
});

export const precomputeFlags = [
  showFreeDeliveryBannerFlag,
  showSummerBannerFlag,
  countryFlag,
] as const;

// used for the pages router example
export const bannerFlags = [showFreeDeliveryBannerFlag] as const;
