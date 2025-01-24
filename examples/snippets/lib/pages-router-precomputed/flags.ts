import { flag } from '@vercel/flags/next';

export const exampleFlag = flag<boolean>({
  key: 'pages-router-precomputed-example-flag',
  decide() {
    return true;
  },
  options: [false, true],
});

export const exampleFlags = [exampleFlag];
