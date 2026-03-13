import { flag } from 'flags/next';

export const basicProxyFlag = flag<boolean>({
  key: 'basic-proxy-flag',
  decide({ cookies }) {
    return cookies.get('basic-proxy-flag')?.value === '1';
  },
});
