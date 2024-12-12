import type { FlagDeclaration, FlagOption } from '../types';
import type { JsonValue } from '..';
import type { IncomingMessage } from 'node:http';

type NextApiRequestCookies = Partial<{
  [key: string]: string;
}>;

/**
 * Metadata on a feature flag function
 */
type FlagMeta<ValueType, EntitiesType> = {
  /**
   * The key of the feature flag
   */
  key: FlagDeclaration<ValueType, EntitiesType>['key'];
  /**
   * An optional defaultValue which will be used when the flag's `decide` function returns undefined or throws an error. Catches async errors too.
   */
  defaultValue?: FlagDeclaration<ValueType, EntitiesType>['defaultValue'];
  /**
   * A URL where this feature flag can be managed. Will show up in Vercel Toolbar.
   */
  origin?: FlagDeclaration<ValueType, EntitiesType>['origin'];
  /**
   * A description of this feature flag. Will show up in Vercel Toolbar.
   */
  description?: FlagDeclaration<ValueType, EntitiesType>['description'];
  /**
   * An array containing available options.
   *
   * * The returend value does not need to be declared in `options`, but it's recommended as all declared options show up in Vercel Toolbar.
   *
   * Value is required, but the label is optional.
   * @example `[{ label: "Off", value: false }, { label: "On", value: true }]`
   *
   * Non-objects like strings can be passed using shorthands which will be used as values without labels.
   * @example `["EUR", "USD"]`
   */
  options?: FlagOption<ValueType>[];
  /**
   * This function is called when the feature flag is used (and no override is present) to return a value.
   */
  decide: FlagDeclaration<ValueType, EntitiesType>['decide'];
  /**
   * This function can establish entities which the `decide` function will be called with.
   */
  identify?: FlagDeclaration<ValueType, EntitiesType>['identify'];
  /**
   * Evaluates a feature flag with custom entities.
   *
   * Calling .run() bypasses the identify call and uses the provided entities directly.
   */
  run: (options: {
    identify:
      | FlagDeclaration<ValueType, EntitiesType>['identify']
      | EntitiesType;
    request?: Parameters<PagesRouterFlag<ValueType, EntitiesType>>[0];
  }) => Promise<ValueType>;
};

export type AppRouterFlag<ValueType, EntitiesType> = {
  (): Promise<ValueType>;
} & FlagMeta<ValueType, EntitiesType>;

export type PagesRouterFlag<ValueType, EntitiesType> = {
  (): never;
  (
    request: IncomingMessage & { cookies: NextApiRequestCookies },
  ): Promise<ValueType>;
} & FlagMeta<ValueType, EntitiesType>;

export type PrecomputedFlag<ValueType, EntitiesType> = {
  (): never;
  (
    groupCode: string,
    groupFlags: readonly Flag<any>[],
    secret?: string,
  ): Promise<ValueType>;
} & FlagMeta<ValueType, EntitiesType>;

export type Flag<ValueType extends JsonValue, EntitiesType = any> =
  | AppRouterFlag<ValueType, EntitiesType>
  | PagesRouterFlag<ValueType, EntitiesType>
  | PrecomputedFlag<ValueType, EntitiesType>;
