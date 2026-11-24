// These types are copies of the types of the same name in `flags` v4, so
// this package does not depend on `flags`. The Flags Explorer reads data of
// this shape.

/**
 * Represents a JSON stringifiable value.
 *
 * This is essentially just `any` to make it easy to work with, but we use a
 * dedicated type to signal the intent.
 */
export type JsonValue = any;

/**
 * Describes the provider of a feature flag.
 */
export type Origin =
  | { provider: 'vercel'; projectId: string }
  | {
      provider: 'global-config';
      globalConfigId: string;
      globalConfigItemKey?: string;
      teamSlug: string;
    }
  | {
      /** @deprecated Use `global-config` instead. */
      provider: 'edge-config';
      edgeConfigId: string;
      edgeConfigItemKey?: string;
      teamSlug: string;
    }
  | Record<string, unknown>;

export interface FlagOptionType {
  value: JsonValue;
  label?: string;
}

export interface FlagDefinitionType {
  options?: FlagOptionType[];
  /**
   * The URL where the feature flag can be managed.
   */
  origin?: string | Origin;
  description?: string;
  /**
   * When a feature flag is declared through `flag` or `declareFlag` instead
   * of being loaded from an external source like a feature flag provider's SDK
   * then this will be `true`.
   */
  declaredInCode?: boolean;
  /**
   * The defaultValue defined in code which will be used when the flag
   * can not be loaded from the provider or throws an error.
   */
  defaultValue?: JsonValue;
  /**
   * The timestamp in milliseconds of when the flag was updated.
   */
  updatedAt?: number;
  /**
   * The timestamp in milliseconds of when the flag was created.
   */
  createdAt?: number;
}

/**
 * Definitions of feature flags.
 *
 * Definitions are data like the description, available options, or its origin.
 */
export type FlagDefinitionsType = Record<string, FlagDefinitionType>;

/**
 * Data flag providers can return to integrate with the Flags Explorer.
 */
export type ProviderData = {
  definitions: FlagDefinitionsType;
  hints: {
    key: string;
    text: string;
  }[];
};
