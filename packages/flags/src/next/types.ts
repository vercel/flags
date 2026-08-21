import type { IncomingMessage } from 'node:http';
import type { JsonValue } from '..';
import type { Adapter, FlagDeclaration, FlagOption } from '../types';

type NextApiRequestCookies = Partial<{
  [key: string]: string;
}>;

/**
 * The Pages Router request shape accepted by `flag(req)` and `evaluate(flags, req)`.
 */
export type PagesRouterRequest = IncomingMessage & {
  cookies: NextApiRequestCookies;
};

/**
 * The request shapes accepted by `flag(req)` and `evaluate(flags, req)` outside
 * of App Router: a Pages Router `IncomingMessage`, or a `NextRequest` / Web
 * `Request` (e.g. from routing middleware).
 */
export type FlagRequest = PagesRouterRequest | Request;

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
   * The adapter used to evaluate this flag, if any. Exposed so `evaluate()`
   * can group flags that share an `adapterId` and call `adapter.bulkDecide`
   * once per group.
   *
   * Always a resolved adapter instance — if a factory was passed to `flag()`
   * it has already been called.
   */
  adapter?: Adapter<ValueType, EntitiesType>;
  /**
   * Flag-level configuration (e.g. `reportValue`).
   */
  config?: FlagDeclaration<ValueType, EntitiesType>['config'];
  /**
   * Evaluates a feature flag with custom entities.
   *
   * Calling .run() bypasses the identify call and uses the provided entities directly.
   */
  run: (options: {
    identify:
      | FlagDeclaration<ValueType, EntitiesType>['identify']
      | EntitiesType;
    request?: FlagRequest;
  }) => Promise<ValueType>;
};

export type AppRouterFlag<ValueType, EntitiesType> =
  (() => Promise<ValueType>) & FlagMeta<ValueType, EntitiesType>;

export type PagesRouterFlag<ValueType, EntitiesType> = {
  (): never;
  (request: FlagRequest): Promise<ValueType>;
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
