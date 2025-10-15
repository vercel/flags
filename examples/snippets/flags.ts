import { flag } from 'flags/next';

export const exampleFlag = flag<boolean>({
  key: 'example-flag',
  decide() {
    return true;
  },
});
