import type { FlagDefinitionType, ProviderData } from 'flags';
import type { IWingifyClient } from 'wingify-fme-node-sdk';
import { WINGIFY_FM_ORIGIN } from '../constants';
import {
  buildDisabledEnabledOptions,
  buildVariableValueOptions,
  listFeatureVariableNames,
  wingifyVariableExplorerKey,
} from './options';

export { wingifyVariableExplorerKey } from './options';

type FeatureModel = ReturnType<
  IWingifyClient['settings']['getFeatures']
>[number];

/**
 * Builds a link back to the Wingify dashboard for a feature.
 *
 * @param featureKey - Wingify feature key to open in the dashboard.
 * @returns Absolute URL with a `feature` query param.
 */
function buildFeatureDashboardUrl(featureKey: string): string {
  // Deep-link so Explorer's open-in-provider icon lands on this feature
  return `${WINGIFY_FM_ORIGIN}?feature=${encodeURIComponent(featureKey)}`;
}

/**
 * Checks whether a flag definition already has Explorer override options.
 *
 * @param flagDefinition - Flag definition from code or Wingify provider data.
 * @returns `true` when `options` is a non-empty array.
 */
function hasOverrideOptions(flagDefinition?: FlagDefinitionType): boolean {
  return (
    Array.isArray(flagDefinition?.options) && flagDefinition.options.length > 0
  );
}

/**
 * Merges Wingify provider metadata with code-defined flags for Flags Explorer.
 *
 * Use this instead of raw `mergeProviderData` — the Flags SDK merge overwrites
 * `options` with `undefined` when a code flag omits `options`, which removes
 * Wingify-generated dropdown values.
 *
 * @param wingifyProviderData - Definitions built from Wingify settings (`getProviderData`).
 * @param codeProviderData - Definitions from `flag()` declarations in the app.
 * @returns Combined provider data; code wins on description, Wingify keeps `origin` and `options` when available.
 */
export function mergeWingifyExplorerData(
  wingifyProviderData: ProviderData,
  codeProviderData: ProviderData,
): ProviderData {
  // Start from Wingify rows so auto-mapped flags stay visible
  const mergedDefinitions: ProviderData['definitions'] = {
    ...wingifyProviderData.definitions,
  };

  for (const [flagKey, codeDefinition] of Object.entries(
    codeProviderData.definitions,
  )) {
    const wingifyDefinition = mergedDefinitions[flagKey] ?? {};

    // Prefer code description, keep Wingify origin/options when code omits better ones
    mergedDefinitions[flagKey] = {
      ...wingifyDefinition,
      ...codeDefinition,
      origin: wingifyDefinition.origin ?? codeDefinition.origin,
      options: hasOverrideOptions(codeDefinition)
        ? codeDefinition.options
        : wingifyDefinition.options,
    };
  }

  return {
    definitions: mergedDefinitions,
    hints: [
      ...(wingifyProviderData.hints ?? []),
      ...(codeProviderData.hints ?? []),
    ],
  };
}

/**
 * Builds one Explorer row for a feature (boolean) or a feature variable.
 *
 * @param feature - Feature model from settings.
 * @param wingifyFeatureKey - Wingify feature key for origin / labels.
 * @param variableName - When set, builds a `feature:variable` dropdown row.
 * @returns Explorer definition with description, origin, and options.
 */
function createExplorerFlagDefinition(
  feature: FeatureModel,
  wingifyFeatureKey: string,
  variableName?: string,
): FlagDefinitionType {
  if (variableName) {
    return {
      description: `${wingifyFeatureKey} — ${variableName}`,
      origin: buildFeatureDashboardUrl(wingifyFeatureKey),
      options: buildVariableValueOptions(feature, variableName),
    };
  }

  return {
    description: feature.getName(),
    origin: buildFeatureDashboardUrl(wingifyFeatureKey),
    options: buildDisabledEnabledOptions(),
  };
}

/**
 * Maps one Wingify feature into Explorer rows.
 * Features with variables become `feature:variable` rows; others become an on/off row.
 *
 * @param feature - Feature model from Wingify settings.
 * @param explorerDefinitions - Mutable map of Explorer definitions to write into.
 * @returns Nothing; updates `explorerDefinitions` in place.
 */
function mapFeatureToExplorerDefinitions(
  feature: FeatureModel,
  explorerDefinitions: ProviderData['definitions'],
): void {
  const featureKey = feature.getKey();
  const variableNames = listFeatureVariableNames(feature);

  // No variables → one toggle for the whole feature
  if (variableNames.length === 0) {
    explorerDefinitions[featureKey] = createExplorerFlagDefinition(
      feature,
      featureKey,
    );
    return;
  }

  // One Explorer row per variable; dropdown = distinct values across variations
  for (const variableName of variableNames) {
    const explorerFlagKey = wingifyVariableExplorerKey(
      featureKey,
      variableName,
    );
    explorerDefinitions[explorerFlagKey] = createExplorerFlagDefinition(
      feature,
      featureKey,
      variableName,
    );
  }
}

/**
 * Returns Wingify FM feature flag definitions for the `.well-known/vercel/flags` API route.
 *
 * Auto-maps every feature from Wingify settings:
 * - no variables → `featureKey` with Disabled / Enabled
 * - has variables → `featureKey:variableName` with a dropdown of distinct values
 *
 * @param wingifyClient - Initialized Wingify FM client (has loaded settings).
 * @returns Provider data for Flags Explorer (`definitions` + `hints`).
 *
 * @example
 * ```ts
 * import { getProviderData as getCodeFlagsProviderData } from 'flags/next';
 * import { getProviderData, mergeWingifyExplorerData, wingifyAdapter } from '@flags-sdk/wingify';
 * import { appFlags } from '@/flags';
 *
 * export const GET = createFlagsDiscoveryEndpoint(async () => {
 *   const client = await wingifyAdapter.wingifyClient;
 *   return mergeWingifyExplorerData(
 *     await getProviderData(client),
 *     getCodeFlagsProviderData(appFlags),
 *   );
 * });
 * ```
 */
export async function getProviderData(
  wingifyClient: IWingifyClient,
): Promise<ProviderData> {
  const features = wingifyClient.settings.getFeatures();
  const explorerDefinitions: ProviderData['definitions'] = {};

  for (const feature of features) {
    mapFeatureToExplorerDefinitions(feature, explorerDefinitions);
  }

  return { definitions: explorerDefinitions, hints: [] };
}
