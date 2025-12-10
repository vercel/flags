import {
  defineEventHandler,
  getRequestHeader,
  setResponseHeader,
  setResponseStatus,
} from 'h3';
// @ts-expect-error
import { flags } from '#flags-defined-flags';
import {
  type ApiData,
  type FlagDefinitionsType,
  verifyAccess,
  version,
} from '../../..';
import { normalizeOptions } from '../../../lib/normalize-options';
import type { Flag } from '../../types';

export default defineEventHandler(async (event) => {
  const auth = getRequestHeader(event, 'authorization');
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
      acc[(d as any)._key || d.key] = {
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
