import type { ReadonlyHeaders } from '../spec-extension/adapters/headers';
import type { ReadonlyRequestCookies } from '../spec-extension/adapters/request-cookies';
import type {
  Decide,
  FlagDeclaration,
  Identify,
  JsonValue,
  Origin,
} from '../types';

/**
 * Framework-agnostic request context.
 * Frameworks build this from their native request types before calling engine primitives.
 */
export interface RequestContext {
  headers: ReadonlyHeaders;
  cookies: ReadonlyRequestCookies;
  /**
   * Object used as WeakMap key for per-request deduplication.
   * Must be the same object reference for the same request.
   * Typically the raw Headers object or the framework's request object.
   */
  cacheKey: object;
}

/**
 * Options passed to `resolveFlag()` by framework adapters.
 */
export interface ResolveFlagOptions<ValueType, EntitiesType> {
  key: string;
  defaultValue?: ValueType;
  decide: Decide<ValueType, EntitiesType>;
  identify?: Identify<EntitiesType>;
  config?: { reportValue?: boolean };
  /**
   * Framework-provided override decryption.
   * Called with the raw `vercel-flag-overrides` cookie value.
   * Should return the decrypted overrides record, or null if decryption fails.
   */
  decryptOverrides: (
    cookieValue: string,
  ) => Promise<Record<string, JsonValue> | null | undefined>;
  /**
   * Whether a caught error is a framework-internal signal that must be re-thrown
   * rather than triggering fallback to defaultValue.
   * For example, Next.js re-throws redirect and dynamic usage errors.
   */
  shouldRethrowError?: (error: unknown) => boolean;
}

/**
 * Minimal flag shape used by engine primitives.
 * Any framework's Flag type should satisfy this interface.
 */
export interface FlagLike<ValueType = any> {
  key: string;
  defaultValue?: ValueType;
  origin?: string | Origin;
  description?: string;
  options?: { value: ValueType; label?: string }[];
}
