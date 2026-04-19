export { getDecide, getIdentify, getOrigin } from './adapter-resolution';
export {
  getCachedValuePromise,
  setCachedValuePromise,
} from './evaluation-cache';
export { attachFlagMetadata } from './flag-metadata';
export {
  combine,
  deserialize,
  generatePermutations,
  getPrecomputed,
  serialize,
} from './precompute';
export { getProviderData } from './provider-data';
export { resolveFlag } from './resolve-flag';
export { sealCookies, sealHeaders } from './seal';
export type { FlagLike, RequestContext, ResolveFlagOptions } from './types';
