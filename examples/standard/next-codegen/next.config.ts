import { withFlags } from '@flags-sdk/next/plugin';

// With codeGeneration, withFlags writes the modules of flags:<source> from
// flags/sources: one time for next build, and after each change of a
// catalog for next dev
export default withFlags({}, { codeGeneration: true });
