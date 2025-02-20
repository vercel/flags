import { flag } from 'flags/next';

export const manualPrecomputeFlag = flag<boolean>({
  key: 'manual-precompute-flag',
  description: 'Manual precompute example',
  decide() {
    return Math.random() > 0.5;
  },
});
