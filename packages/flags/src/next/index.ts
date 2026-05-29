import { normalizeOptions } from '../lib/normalize-options';
import { setSpanAttribute, trace } from '../lib/tracing';
import type {
  Decide,
  FlagDeclaration,
  FlagDefinitionsType,
  FlagDefinitionType,
  Identify,
  JsonValue,
  Origin,
  ProviderData,
} from '../types';
import { BULK_IDENTIFY_REF, BULKABLE, getRun } from './evaluate';
import { getPrecomputed } from './precompute';
import type { Flag, PagesRouterFlag, PrecomputedFlag } from './types';

export { evaluate } from './evaluate';
export {
  combine,
  deserialize,
  generatePermutations,
  getPrecomputed,
  precompute,
  serialize,
} from './precompute';
export type { Flag } from './types';

function getDecide<ValueType, EntitiesType>(
  definition: FlagDeclaration<ValueType, EntitiesType>,
): Decide<ValueType, EntitiesType> {
  if (definition.adapter && typeof definition.adapter.decide !== 'function') {
    throw new Error(
      `flags: You passed an adapter that does not have a "decide" method for flag "${definition.key}". Did you pass "adapter: exampleAdapter" instead of "adapter: exampleAdapter()"?`,
    );
  }

  if (
    typeof definition.decide !== 'function' &&
    typeof definition.adapter?.decide !== 'function'
  ) {
    throw new Error(
      `flags: You passed a flag declaration that does not have a "decide" method for flag "${definition.key}"`,
    );
  }

  return function decide(params) {
    if (typeof definition.decide === 'function') {
      return definition.decide(params);
    }
    if (typeof definition.adapter?.decide === 'function') {
      return definition.adapter.decide({ key: definition.key, ...params });
    }
    throw new Error(`flags: No decide function provided for ${definition.key}`);
  };
}

function getIdentify<ValueType, EntitiesType>(
  definition: FlagDeclaration<ValueType, EntitiesType>,
): Identify<EntitiesType> {
  return function identify(params) {
    if (typeof definition.identify === 'function') {
      return definition.identify(params);
    }
    if (typeof definition.adapter?.identify === 'function') {
      return definition.adapter.identify(params);
    }
    return definition.identify;
  };
}

function getOrigin<ValueType, EntitiesType>(
  definition: FlagDeclaration<ValueType, EntitiesType>,
): string | Origin | undefined {
  if (definition.origin) return definition.origin;
  if (typeof definition.adapter?.origin === 'function')
    return definition.adapter.origin(definition.key);
  return definition.adapter?.origin;
}

/**
 * Declares a feature flag.
 *
 * This a feature flag function. When that function is called it will call the flag's `decide` function and return the result.
 *
 * If an override set by Vercel Toolbar, or more precisely if the `vercel-flag-overrides` cookie, is present then the `decide` function will not be called and the value of the override will be returned instead.
 *
 * In both cases this function also calls the `reportValue` function of `flags` so the evaluated flag shows up in Runtime Logs and is available for use with Web Analytics custom server-side events.
 *
 *
 * @param definition - Information about the feature flag.
 * @returns - A feature flag declaration
 */
export function flag<
  ValueType extends JsonValue = boolean | string | number,
  EntitiesType = any,
>(
  definition: FlagDeclaration<ValueType, EntitiesType>,
): Flag<ValueType, EntitiesType> {
  const decide = getDecide<ValueType, EntitiesType>(definition);
  const identify = getIdentify<ValueType, EntitiesType>(definition);
  const run = getRun<ValueType, EntitiesType>(definition, decide);
  const origin = getOrigin(definition);

  const api = trace(
    async (...args: any[]) => {
      // Default method, may be overwritten by `getPrecomputed` or `run`
      // which is why we must not trace them directly in here,
      // as the attribute should be part of the `flag` function.
      setSpanAttribute('method', 'decided');

      // the flag was precomputed, works for both App Router and Pages Router
      if (typeof args[0] === 'string' && Array.isArray(args[1])) {
        const [precomputedCode, precomputedGroup, secret] = args as Parameters<
          PrecomputedFlag<ValueType, EntitiesType>
        >;
        if (precomputedCode && precomputedGroup) {
          setSpanAttribute('method', 'precomputed');
          const value = await getPrecomputed(
            api,
            precomputedGroup,
            precomputedCode,
            secret,
          );
          if (value === undefined) return definition.defaultValue!;
          return value;
        }
      }

      // check if we're using the flag in pages router
      //
      // ideally we'd check args[0] instanceof IncomingMessage, but that leads
      // to build time errors in the host application due to Edge Runtime,
      // so we check for headers on the first arg instead, which indicates an
      // IncomingMessage
      if (args[0] && typeof args[0] === 'object' && 'headers' in args[0]) {
        const [request] = args as Parameters<
          PagesRouterFlag<ValueType, EntitiesType>
        >;
        return run({ identify, request });
      }

      // the flag is being used in app router
      return run({ identify, request: undefined });
    },
    {
      name: 'flag',
      isVerboseTrace: false,
      attributes: { key: definition.key },
    },
  ) as Flag<ValueType, EntitiesType>;

  api.key = definition.key;
  api.defaultValue = definition.defaultValue;
  api.origin = origin;
  api.options = normalizeOptions<ValueType>(definition.options);
  api.description = definition.description;
  api.identify = identify
    ? trace(identify, {
        isVerboseTrace: false,
        name: 'identify',
        attributes: { key: definition.key },
      })
    : identify;
  api.decide = trace(decide, {
    isVerboseTrace: false,
    name: 'decide',
    attributes: { key: definition.key },
  });
  api.run = trace(run, {
    isVerboseTrace: false,
    name: 'run',
    attributes: { key: definition.key },
  });
  api.adapter = definition.adapter;
  api.config = definition.config;

  // Internal markers used by `evaluate()` to partition flags into adapter
  // groups. See `./evaluate.ts` for the symbol definitions.
  (api as any)[BULK_IDENTIFY_REF] =
    definition.identify ?? definition.adapter?.identify ?? null;
  (api as any)[BULKABLE] =
    !definition.decide &&
    !!definition.adapter?.bulkDecide &&
    definition.adapter.adapterId !== undefined;

  return api;
}

export type KeyedFlagDefinitionType = { key: string } & FlagDefinitionType;

// -----------------------------------------------------------------------------

/**
 * Takes an object whose values are feature flag declarations and
 * turns them into ProviderData to be returned through `/.well-known/vercel/flags`.
 */
export function getProviderData(
  flags: Record<
    string,
    // accept an unknown array
    KeyedFlagDefinitionType | readonly unknown[]
  >,
): ProviderData {
  const definitions = Object.values(flags)
    // filter out precomputed arrays
    .filter((i): i is KeyedFlagDefinitionType => !Array.isArray(i))
    .reduce<FlagDefinitionsType>((acc, d) => {
      // maps the existing type from the facet definitions to the type
      // the toolbar expects
      acc[d.key] = {
        options: d.options,
        origin: d.origin,
        description: d.description,
        defaultValue: d.defaultValue,
        declaredInCode: true,
      } satisfies FlagDefinitionType;
      return acc;
    }, {});

  return { definitions, hints: [] };
}

export { createFlagsDiscoveryEndpoint } from './create-flags-discovery-endpoint';
export { clearDedupeCacheForCurrentRequest, dedupe } from './dedupe';
