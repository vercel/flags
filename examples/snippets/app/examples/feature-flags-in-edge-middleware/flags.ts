import { flag } from 'flags/next';

export const basicEdgeMiddlewareFlag = flag<boolean>({
  key: 'basic-edge-middleware-flag',
  decide({ cookies }) {
    return cookies.get('basic-edge-middleware-flag')?.value === '1';
  },
});
