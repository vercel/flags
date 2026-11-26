export { version } from '../package.json';
export { clearDedupeCacheForCurrentRequest, dedupe } from './dedupe';
export { evaluate, getEvaluatedFlagValues } from './evaluate';
export {
  flag,
  getProviderData,
  type KeyedFlagDefinitionType,
} from './flag';
export type {
  AppRouterFlag,
  Flag,
  FlagRequest,
  PagesRouterFlag,
  PagesRouterRequest,
  PrecomputedFlag,
} from './flag-types';
export {
  createAccessProof,
  decryptFlagDefinitions,
  decryptFlagValues,
  decryptOverrides,
  encryptFlagDefinitions,
  encryptFlagValues,
  encryptOverrides,
  verifyAccessProof,
} from './lib/crypto';
export { signOverrides } from './lib/flag-overrides-platform';
export type { FrameworkBinding, FrameworkRequest } from './lib/framework';
export { mergeProviderData } from './lib/merge-provider-data';
export { reportValue } from './lib/report-value';
export { safeJsonStringify } from './lib/safe-json-stringify';
export { setTracerProvider } from './lib/tracing';
export { verifyAccess } from './lib/verify-access';
export {
  combine,
  deserialize,
  generatePermutations,
  getPrecomputed,
  precompute,
  serialize,
} from './precompute';
export {
  HeadersAdapter,
  type ReadonlyHeaders,
} from './spec-extension/adapters/headers';
export {
  type ReadonlyRequestCookies,
  RequestCookiesAdapter,
} from './spec-extension/adapters/request-cookies';
export type {
  Adapter,
  ApiData,
  Decide,
  FlagDeclaration,
  FlagDefinitionsType,
  FlagDefinitionType,
  FlagOptionType,
  FlagOverridesType,
  FlagValuesType,
  GenerousOption,
  Identify,
  JsonValue,
  Origin,
  ProviderData,
} from './types';
