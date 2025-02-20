import { flag } from 'flags/next';

export const exampleFlag = flag<boolean>({
  key: 'pages-router-precomputed-example-flag',
  decide() {
    return true;
  },
  options: [false, true],
});

export const exampleFlags = [exampleFlag];
