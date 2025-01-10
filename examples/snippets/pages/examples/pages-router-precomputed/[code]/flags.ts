import { flag } from '@vercel/flags/next';

export const exampleFlag = flag({
  key: 'pages-router-precomputed-example-flag',
  decide() {
    return true;
  },
  options: [false, true],
});

export const exampleFlags = [exampleFlag];
