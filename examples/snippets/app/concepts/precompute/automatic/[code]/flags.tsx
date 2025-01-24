import { flag } from '@vercel/flags/next';

export const firstPrecomputedFlag = flag<boolean>({
  key: 'first-precomputed-flag',
  decide: () => Math.random() > 0.5,
});

export const secondPrecomputedFlag = flag<boolean>({
  key: 'second-precomputed-flag',
  decide: () => Date.now() % 2 === 0,
});

// a group of feature flags to be precomputed
export const marketingFlags = [
  firstPrecomputedFlag,
  secondPrecomputedFlag,
] as const;
