import { flag } from 'flags';

export const exampleFlag = flag<boolean>({
  key: 'example-flag',
  decide: () => true,
  defaultValue: false,
});
