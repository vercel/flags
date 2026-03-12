import { version } from '../../package.json';
import type { OutcomeType, ResolutionReason } from '../types';

/**
 * Only used internally for now.
 */
export function internalReportValue(
  key: string,
  value: unknown,
  data: {
    originProjectId?: string;
    originProvider?: 'vercel';
    outcomeType?: OutcomeType;
    reason?: ResolutionReason | 'override';
  },
) {
  const symbol = Symbol.for('@vercel/request-context');
  const ctx = Reflect.get(globalThis, symbol)?.get();
  const reportFlagValue = ctx?.flags?.reportValue;
  if (typeof reportFlagValue !== 'function') return;

  reportFlagValue.call(ctx.flags, key, value, {
    sdkVersion: version,
    ...data,
  });
}
