import { flag } from '@vercel/flags/next';

export const deliveryTimeFlag = flag({
  key: 'show-delivery-time',
  // defaultValue: false,
  // options: [{ value: false }, { value: true }],
  async decide() {
    return false;
  },
});
