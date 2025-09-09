import { Flagship, type BucketingDTO } from '@flagship.io/js-sdk';
import type { FlagDefinitionsType, ProviderData } from 'flags';
import type { AdapterConfig } from '../types';
import { logError } from './utils';

export async function fetchInitialBucketingData(
  config: AdapterConfig,
): Promise<BucketingDTO | undefined> {
  try {
    const connectionString = config.connectionString || process.env.EDGE_CONFIG;
    if (!connectionString) {
      throw new Error(
        'Flagship connectionString is required for BUCKETING_EDGE mode',
      );
    }

    const edgeConfigItemKey =
      config.edgeConfigItemKey || process.env.EDGE_CONFIG_ITEM_KEY;
    if (!edgeConfigItemKey) {
      throw new Error(
        'Flagship edgeConfigItemKey is required for BUCKETING_EDGE mode',
      );
    }

    let edgeConfigUrl;
    try {
      edgeConfigUrl = new URL(connectionString);
    } catch (error) {
      throw new Error(`Invalid Flagship connectionString: ${connectionString}`);
    }
    const token = edgeConfigUrl.searchParams.get('token');
    if (!token) {
      throw new Error(
        'Flagship connectionString must contain a token query parameter',
      );
    }
    edgeConfigUrl.pathname += `/item/${edgeConfigItemKey}`;

    const response = await fetch(edgeConfigUrl.toString());
    if (!response.ok) {
      throw new Error(
        `Failed to fetch initial bucketing: ${response.status} ${response.statusText}`,
      );
    }
    const data = await response.json();
    return data as BucketingDTO;
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Unknown error fetching initial bucketing';
    logError(Flagship.getConfig(), errorMessage, 'fetchInitialBucketingData');
    return undefined;
  }
}

function transformBucketingToProviderData(
  data: BucketingDTO,
  envId: string,
): ProviderData {
  const featureDefinitions: FlagDefinitionsType = {};

  data.campaigns?.forEach((campaign) => {
    campaign.variationGroups.forEach((variationGroup) => {
      variationGroup.variations.forEach((variation) => {
        Object.entries(
          variation.modifications.value as Record<string, unknown>,
        ).forEach(([key, value]) => {
          const origin = `https://app.flagship.io/env/${envId}/report/ab/${campaign.id}/details`;
          const description = `Campaign: ${campaign.name}`;
          if (!featureDefinitions[key]) {
            featureDefinitions[key] = {
              options: [
                {
                  value,
                },
              ],
              origin,
              description,
            };
          } else {
            featureDefinitions[key].options?.push({
              value,
            });
            featureDefinitions[key].origin = origin;
            featureDefinitions[key].description = description;
          }
        });
      });
    });
  });

  return {
    definitions: featureDefinitions,
    hints: [],
  };
}

export async function getProviderData(envId: string): Promise<ProviderData> {
  try {
    const url = `https://cdn.flagship.io/${envId}/bucketing.json`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch provider data: ${response.status} ${response.statusText}`,
      );
    }
    const data = (await response.json()) as BucketingDTO;

    return transformBucketingToProviderData(data, envId);
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Unknown error fetching provider data';
    logError(Flagship.getConfig(), errorMessage, 'getProviderData');
    return {
      definitions: {},
      hints: [],
    };
  }
}
