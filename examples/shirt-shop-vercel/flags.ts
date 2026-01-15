import { vercelAdapter } from '@flags-sdk/vercel';
import type { Identify } from 'flags';
import { dedupe, flag } from 'flags/next';
import { getStableId } from './lib/get-stable-id';

////////////////////////////////////////////////////////////////////////////////

type EvaluationContext = {
  visitor: { id: string };
};

const identify = dedupe(async () => {
  const stableId = await getStableId();

  return {
    visitor: {
      id: stableId.value,
    },
  };
}) satisfies Identify<EvaluationContext>;

////////////////////////////////////////////////////////////////////////////////

export const showSummerBannerFlag = flag<boolean, EvaluationContext>({
  key: 'summer-sale',
  description: 'Shows a bright yellow banner for a 20% discount',
  defaultValue: false,
  identify,
  adapter: vercelAdapter(),
});

export const showFreeDeliveryBannerFlag = flag<boolean, EvaluationContext>({
  key: 'free-delivery',
  description: 'Show a black free delivery banner at the top of the page',
  // defaultValue: false,
  identify,
  adapter: vercelAdapter(),
});

export const proceedToCheckoutColorFlag = flag<string, EvaluationContext>({
  key: 'proceed-to-checkout-color',
  description: 'The color of the proceed to checkout button',
  defaultValue: 'blue',
  options: ['blue', 'green', 'red'],
  identify,
  adapter: vercelAdapter(),
});

export const delayFlag = flag<number>({
  key: 'delay',
  defaultValue: 0,
  description:
    'A flag for debugging and demo purposes which delays the data loading',
  options: [
    { value: 0, label: 'No delay' },
    { value: 200, label: '200ms' },
    { value: 1000, label: '1s' },
    { value: 3000, label: '3s' },
    { value: 10_000, label: '10s' },
  ],
  adapter: vercelAdapter(),
});

export const productFlags = [
  showFreeDeliveryBannerFlag,
  showSummerBannerFlag,
] as const;
