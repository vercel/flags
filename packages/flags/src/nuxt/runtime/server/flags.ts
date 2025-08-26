import {
  defineEventHandler,
  setResponseStatus,
  setResponseHeader,
  getRequestHeader,
} from 'h3';
import { ApiData, FlagDefinitionsType, verifyAccess, version } from '../../..';
import { Flag } from '../../types';
import { normalizeOptions } from '../../../lib/normalize-options';

// @ts-ignore
import { flags } from '#flags/defined-flags';

export default defineEventHandler(async (event) => {
  const auth = getRequestHeader(event, 'authorization') as string;
  const access = await verifyAccess(auth, process.env.FLAGS_SECRET);
  if (!access) {
    setResponseStatus(event, 401);
    return null;
  }
  const providerData = getProviderData(flags);
  setResponseHeader(event, 'x-flags-sdk-version', version);
  return providerData;
});

function getProviderData(flags: Record<string, Flag<any>>): ApiData {
  const definitions = Object.values(flags).reduce<FlagDefinitionsType>(
    (acc, d) => {
      acc[d.key] = {
        options: normalizeOptions(d.options),
        origin: d.origin,
        description: d.description,
      };
      return acc;
    },
    {},
  );

  return { definitions, hints: [] };
}
