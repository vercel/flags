import { Adapter } from '@vercel/flags';
import type { Configuration } from '@happykit/flags/config';
import type { FlagUser, Traits } from '@happykit/flags/client';
import { createGetFlags } from '@happykit/flags/server';
import type { GetDefinitions, Definitions } from '@happykit/flags/api-route';
import { get } from '@vercel/edge-config';

export { getProviderData } from './provider';

export const getDefinitions: GetDefinitions = async (
  projectId,
  envKey,
  environment,
) => {
  const definitions = await get<Definitions>(`happykit_v1_${projectId}`);
  return definitions ?? null;
};

type Flags = {
  [key: string]: boolean | number | string | null;
};

export function createHappyKitAdapter<AppFlags extends Flags = Flags>(options: {
  envKey: Configuration<any>['envKey'];
  endpoint: Configuration<any>['endpoint'];
}) {
  let initialized = false;
  const getFlags = createGetFlags<AppFlags>({
    envKey: options.envKey,
    endpoint: options.endpoint,
  });

  // per adapter instance
  return function happyKitAdapter<
    ValueType extends boolean | number | string | null,
    EntitiesType extends {
      user?: FlagUser;
      traits?: Traits;
    },
  >(): Adapter<ValueType, EntitiesType> {
    // per flag instance
    return {
      initialize: async () => {
        if (initialized) return;
        return Promise.resolve();
      },
      identify: (): EntitiesType => {
        return {} as EntitiesType;
      },
      async decide({ key, entities }) {
        const flags = await getFlags({
          user: entities?.user,
          traits: entities?.traits,
          getDefinitions,
        });
        if (!flags.flags) {
          throw new Error(`@flags-sdk/happykit: Flags could not be loaded`);
        }
        const value = flags.flags[key];
        if (value === undefined) {
          throw new Error(
            `@flags-sdk/happykit: Flags "${key}" could not be found`,
          );
        }
        return value as ValueType;
      },
    };
  };
}

let defaultHappyKitAdapter:
  | ReturnType<typeof createHappyKitAdapter>
  | undefined;

export function resetDefaultHappyKitAdapter() {
  defaultHappyKitAdapter = undefined;
}

export function happyKitAdapter<
  ValueType extends boolean | number | string | null,
  EntitiesType extends {
    user?: FlagUser;
    traits?: Traits;
  },
>() {
  if (!defaultHappyKitAdapter) {
    if (!process.env.HAPPYKIT_ENDPOINT) {
      throw new Error('@flags-sdk/happykit: HAPPYKIT_ENDPOINT is not set');
    }
    if (!process.env.HAPPYKIT_ENV_KEY) {
      throw new Error('@flags-sdk/happykit: HAPPYKIT_ENV_KEY is not set');
    }

    defaultHappyKitAdapter = createHappyKitAdapter<any>({
      endpoint: process.env.HAPPYKIT_ENDPOINT,
      envKey: process.env.HAPPYKIT_ENV_KEY,
    });
  }
  return defaultHappyKitAdapter;
}
