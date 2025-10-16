import { version } from '../../../package.json';
import type { OutcomeType, Reason } from '../types';

/**
 * Only used interally for now.
 */
export function internalReportValue(
  key: string,
  value: unknown,
  data: {
    originProjectId?: string;
    originProvider?: 'vercel';
    outcomeType?: OutcomeType;
    reason?: Reason | 'override';
  },
) {
  const symbol = Symbol.for('@vercel/request-context');
  const ctx = Reflect.get(globalThis, symbol)?.get();
  ctx?.flags?.reportValue(key, value, {
    sdkVersion: version,
    ...data,
  });
}
