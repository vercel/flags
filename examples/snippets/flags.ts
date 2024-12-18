import { flag } from '@vercel/flags/next';

export const exampleFlag = flag({
  key: 'example-flag',
  decide() {
    return true;
  },
});
