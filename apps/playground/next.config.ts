import { withFlags } from '@flags-sdk/next/plugin';

// withFlags compiles the flags files and writes the modules of flags:<source>
// the flags files: one time for next build, and after each change for next dev
export default withFlags({});
