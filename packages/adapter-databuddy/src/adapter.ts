import type { Adapter, JsonValue } from 'flags';

interface DatabuddyUser {
  userId?: string;
  email?: string;
  properties?: Record<string, any>;
}

export interface DatabuddyAdapterOptions {
  /** Databuddy Client ID */
  clientId: string;
  /** Databuddy API Key (optional, for server-side) */
  apiKey?: string;
  /** Override API URL for self-hosted users */
  apiUrl?: string;
  /** Environment context */
  environment?: string;
  /** User identification function */
  identifyUser?: (params: { headers: any; cookies: any }) => Promise<DatabuddyUser> | DatabuddyUser;
  /** Cache TTL in milliseconds (default: 60000) */
  cacheTtl?: number;
}

interface FlagEvaluationResponse {
  enabled: boolean;
  value: JsonValue;
  payload?: any;
  reason: string;
  variantName?: string;
}

/**
 * Create a Databuddy adapter for Vercel Flags SDK
 * @example
 * ```typescript
 * import { flag } from 'flags/next';
 * import { createDatabuddyAdapter } from '@vercel/flags-adapter-databuddy';
 *
 * const adapter = createDatabuddyAdapter({
 *   clientId: process.env.DATABUDDY_CLIENT_ID!,
 *   apiKey: process.env.DATABUDDY_API_KEY,
 *   environment: process.env.NODE_ENV || 'production',
 * });
 *
 * export const showNewFeature = flag({
 *   key: 'show-new-feature',
 *   adapter,
 *   defaultValue: false,
 * });
 * ```
 */
export function createDatabuddyAdapter<ValueType = JsonValue, EntitiesType = DatabuddyUser>(
  options: DatabuddyAdapterOptions,
): Adapter<ValueType, EntitiesType> {
  const {
    clientId,
    apiKey,
    apiUrl = 'https://api.databuddy.cc',
    environment = 'production',
    identifyUser,
    cacheTtl = 60000,
  } = options;

  // Simple in-memory cache for server-side
  const cache = new Map<string, { value: ValueType; expiresAt: number }>();

  return {
    config: {
      reportValue: true,
    },

    origin: (key: string) => ({
      provider: 'databuddy',
      flagKey: key,
      clientId,
      environment,
    }),

    identify: async (params) => {
      if (!identifyUser) {
        return undefined;
      }
      return identifyUser(params) as EntitiesType;
    },

    decide: async ({ key, entities, headers, cookies, defaultValue }) => {
      // Check cache first
      const cached = cache.get(key);
      if (cached && Date.now() < cached.expiresAt) {
        return cached.value;
      }

      try {
        const user = entities as unknown as DatabuddyUser;

        // Build query parameters
        const params = new URLSearchParams();
        params.set('key', key);
        params.set('clientId', clientId);
        params.set('environment', environment);

        if (user?.userId) {
          params.set('userId', user.userId);
        }
        if (user?.email) {
          params.set('email', user.email);
        }
        if (user?.properties) {
          params.set('properties', JSON.stringify(user.properties));
        }

        const url = `${apiUrl}/public/v1/flags/evaluate?${params.toString()}`;

        const fetchOptions: RequestInit = {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
        };

        // Add API key if provided
        if (apiKey) {
          fetchOptions.headers = {
            ...fetchOptions.headers,
            Authorization: `Bearer ${apiKey}`,
          };
        }

        const response = await fetch(url, fetchOptions);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result: FlagEvaluationResponse = await response.json();

        // Cache the result
        cache.set(key, {
          value: result.value as ValueType,
          expiresAt: Date.now() + cacheTtl,
        });

        return result.value as ValueType;
      } catch (error) {
        // Log error and return default value
        console.error(`[Databuddy] Flag evaluation failed for "${key}":`, error);
        return defaultValue as ValueType;
      }
    },
  };
}
