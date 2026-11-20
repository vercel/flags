/**
 * The subpath `flags/overrides`: the options of the overrides. A framework
 * plugin replaces it with a bundler alias of `flags/overrides.ts` of the
 * application. Without the file, the SDK uses its defaults.
 */
import type { OverridesOptions } from './overrides/reader';

const overrides: OverridesOptions | undefined = undefined;

export default overrides;
