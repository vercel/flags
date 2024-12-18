import { flag } from '@vercel/flags/next';

export const randomFlag = flag<boolean>({
  key: 'random-flag',
  description: 'A flag that is on for 50% of visitors',
  decide() {
    return Math.random() > 0.5;
  },
});

export const overviewFlags = [randomFlag];
