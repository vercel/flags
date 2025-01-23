import type { ReadonlyHeaders } from './spec-extension/adapters/headers';
import type { ReadonlyRequestCookies } from './spec-extension/adapters/request-cookies';
export type { ReadonlyHeaders } from './spec-extension/adapters/headers';
export type { ReadonlyRequestCookies } from './spec-extension/adapters/request-cookies';

export type FlagParamsType = {
  headers: ReadonlyHeaders;
  cookies: ReadonlyRequestCookies;
};

/**
 * Data flag providers can return to integrate with the toolbar.
 */
export type ProviderData = {
  definitions: FlagDefinitionsType;
  hints: { key: string; text: string }[];
};

/**
 * Describes the provider of a feature flag
 */
export type Origin =
  | {
      provider: 'vercel';
      projectId: string;
    }
  | {
      provider: 'edge-config';
      edgeConfigId: string;
      edgeConfigItemKey?: string;
      teamSlug: string;
    }
  | Record<string, unknown>;

/**
 * Data returned by the .well-known/vercel/flags API Route which the toolbar understands.
 */
export type ApiData = {
  /**
   * Metadata about your application's feature flags
   */
  definitions?: FlagDefinitionsType;
  /**
   * Hints show up in the toolbar. They are meant to be used in case loading
   * data from your flag provider fails. For example when the provider fails to
   * responed or the configuration is invalid due to a missing environment variable.
   */
  hints?: ProviderData['hints'];
  /**
   * Sets the encryption mode for the vercel-flag-overrides cookie
   * - when set to "encrypted" the toolbar will store encrypted overrides
   * - when set to "plaintext" the toolbar will store plaintext overrides
   */
  overrideEncryptionMode?: 'encrypted' | 'plaintext';
};

/**
 * Represents a JSON stringifiable value.
 *
 * This is essentially just `any` to make it easy to work with, but we use a dedicated type to signal the intent.
 */
export type JsonValue = any;

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
 * Definitions of a feature flags.
 *
 * Definitions are data like the description, available options, or its origin.
 */
export type FlagDefinitionsType = Record<string, FlagDefinitionType>;

/**
 * Values of feature flags.
 *
 * This record consists of key-value pairs of flag keys and the value they resolved to.
 */
export type FlagValuesType = Record<string, JsonValue>;

/**
 * Overrides of feature flags.
 *
 * This record consists of key-value pairs of flag keys and the override to be used for them.
 */
export type FlagOverridesType = Record<string, JsonValue>;

////////////////////////////////////////////////////////////
// Usage in Code
////////////////////////////////////////////////////////////

export type FlagOption<T> = { value: T; label?: string };

export type GenerousOption<T> = boolean extends T
  ? boolean | FlagOption<T>
  : T extends string | number
    ? T | FlagOption<T>
    : FlagOption<T>;

export type Decide<ValueType, EntitiesType> = (
  params: FlagParamsType & {
    entities?: EntitiesType;
  },
) => Promise<ValueType> | ValueType;

export type Identify<EntitiesType> = (
  params: FlagParamsType,
) => Promise<EntitiesType | undefined> | EntitiesType | undefined;

/** An adapter interface to use the Flags SDK with any flag provider */
export interface Adapter<ValueType, EntitiesType> {
  initialize?: () => Promise<void>;
  identify?: Identify<EntitiesType>;
  origin?: Origin | string | ((key: string) => Origin | string | undefined);
  config?: {
    reportValue?: boolean;
  };
  decide: (params: {
    key: string;
    entities?: EntitiesType;
    headers: ReadonlyHeaders;
    cookies: ReadonlyRequestCookies;
  }) => Promise<ValueType> | ValueType;
}

/**
 * Definition when declaring a feature flag, as provided to `flag(declaration)`
 */
export type FlagDeclaration<ValueType, EntitiesType> = {
  /**
   * The key of the feature flag
   */
  key: string;
  /**
   * An optional defaultValue which will be used when the flag's `decide` function returns undefined or throws an error. Catches async errors too.
   */
  defaultValue?: ValueType;
  /**
   * A URL where this feature flag can be managed. Will show up in Vercel Toolbar.
   */
  origin?: string | Origin;
  /**
   * A description of this feature flag. Will show up in Vercel Toolbar.
   */
  description?: string;
  /**
   * An array containing available options.
   *
   * The returend value does not need to be declared in `options`, but it's recommended as all declared options show up in Vercel Toolbar.
   *
   * Value is required, but the label is optional.
   * @example `[{ label: "Off", value: false }, { label: "On", value: true }]`
   *
   * Non-objects like strings can be passed using shorthands which will be used as values without labels.
   * @example `["EUR", "USD"]`
   */
  options?: GenerousOption<ValueType>[];
  /**
   * Configuration options that can be passed to the flag.
   */
  config?: {
    reportValue?: boolean;
  };
  /**
   * Adapters can implement default behavior for flags.
   *
   * Explicitly provided values always override adapters.
   */
  // adapter?: Adapter<ValueType, EntitiesType>;
  /**
   * This function is called when the feature flag is used (and no override is present) to return a value.
   */
  // decide?: Decide<ValueType, EntitiesType>;
  /**
   * This function can establish entities which the `decide` function will be called with.
   */
  identify?: Identify<EntitiesType>;
} & (
  | {
      adapter: Adapter<ValueType, EntitiesType>;
      decide?: Decide<ValueType, EntitiesType>;
    }
  | {
      adapter?: Adapter<ValueType, EntitiesType>;
      decide: Decide<ValueType, EntitiesType>;
    }
);
