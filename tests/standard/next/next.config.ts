import { withFlags } from 'flags/next/plugin';

export default withFlags({
  // The platform variant of the tests builds into its own directory
  distDir: process.env.NEXT_DIST_DIR || '.next',
});
