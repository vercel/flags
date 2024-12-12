import { version } from '../../package.json';

/**
 * This function lets you report the value of a resolved flag, which will make it available when viewing Monitoring, Logs, Analytics and Speed Insights on Vercel.
 * It's important to note that this only has effects when running on Vercel in a preview or production environments, but not during local development.
 *
 * @example Using `reportValue` to report a flag value.
 * ```
 *  import { type NextRequest, NextResponse } from "next/server";
 *  import { reportValue } from '@vercel/flags';
 *
 *  export async function GET(request: NextRequest) {
 *    reportValue('my-flag', true);
 *    return NextResponse.json({});
 *  }
 * ```
 *
 * @param key the name of the flag
 * @param value the resolved value of the flag
 */
export function reportValue(key: string, value: unknown) {
  const symbol = Symbol.for('@vercel/request-context');
  const ctx = Reflect.get(globalThis, symbol)?.get();
  ctx?.flags?.reportValue(key, value, {
    sdkVersion: version,
  });
}

/**
 * Only used interally for now.
 */
export function internalReportValue(
  key: string,
  value: unknown,
  data: {
    originProjectId?: string;
    originProvider?: 'vercel';
    reason?: 'override';
  },
) {
  const symbol = Symbol.for('@vercel/request-context');
  const ctx = Reflect.get(globalThis, symbol)?.get();
  ctx?.flags?.reportValue(key, value, {
    sdkVersion: version,
    ...data,
  });
}
