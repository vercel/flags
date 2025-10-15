export { version } from "../package.json";
export {
	createAccessProof,
	decryptFlagDefinitions,
	decryptFlagValues,
	decryptOverrides,
	encryptFlagDefinitions,
	encryptFlagValues,
	encryptOverrides,
	verifyAccessProof,
} from "./lib/crypto";
export { mergeProviderData } from "./lib/merge-provider-data";
export { reportValue } from "./lib/report-value";
export { safeJsonStringify } from "./lib/safe-json-stringify";
export { setTracerProvider } from "./lib/tracing";
export { verifyAccess } from "./lib/verify-access";
export {
	HeadersAdapter,
	type ReadonlyHeaders,
} from "./spec-extension/adapters/headers";
export {
	type ReadonlyRequestCookies,
	RequestCookiesAdapter,
} from "./spec-extension/adapters/request-cookies";
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
} from "./types";
