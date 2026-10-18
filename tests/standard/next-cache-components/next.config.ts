import { withFlags } from '@flags-sdk/next/plugin';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';

export default (phase: string) =>
  withFlags({
    cacheComponents: true,
    partialPrefetching: true,
    // Pages which must fail, e.g. app/cached/page.dev.tsx, exist only in
    // development, so that the build of the tests succeeds
    pageExtensions:
      phase === PHASE_DEVELOPMENT_SERVER
        ? ['dev.tsx', 'tsx', 'ts']
        : ['tsx', 'ts'],
  });
