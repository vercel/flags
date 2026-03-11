import { afterEach, describe, expect, it } from 'vitest';

import { ResolutionReason } from '../types';
import { internalReportValue } from './report-value';

const requestContextSymbol = Symbol.for('@vercel/request-context');
const previousRequestContext = Reflect.get(globalThis, requestContextSymbol);

type ReportCall = {
  readonly key: string;
  readonly value: unknown;
  readonly data: Record<string, unknown>;
};

function createRequestContext() {
  const calls: ReportCall[] = [];
  const flags = {
    calls,
    reportValue(
      this: { calls: ReportCall[] },
      key: string,
      value: unknown,
      data: Record<string, unknown>,
    ) {
      this.calls.push({ key, value, data });
    },
  };

  return { flags };
}

describe('internalReportValue', () => {
  afterEach(() => {
    if (previousRequestContext === undefined) {
      Reflect.deleteProperty(globalThis, requestContextSymbol);
      return;
    }

    Reflect.set(globalThis, requestContextSymbol, previousRequestContext);
  });

  it('does not crash when the request-context reportValue hook is not callable', () => {
    Reflect.set(globalThis, requestContextSymbol, {
      get() {
        return { flags: { reportValue: true } };
      },
    });

    expect(() =>
      internalReportValue('flagA', true, {
        originProjectId: 'prj_123',
        originProvider: 'vercel',
        reason: ResolutionReason.PAUSED,
      }),
    ).not.toThrow();
  });

  it('preserves method binding for callable request-context hooks', () => {
    const requestContext = createRequestContext();
    Reflect.set(globalThis, requestContextSymbol, {
      get() {
        return requestContext;
      },
    });

    internalReportValue('flagA', true, {
      originProjectId: 'prj_123',
      originProvider: 'vercel',
      reason: ResolutionReason.PAUSED,
    });

    expect(requestContext.flags.calls).toEqual([
      {
        key: 'flagA',
        value: true,
        data: expect.objectContaining({
          originProjectId: 'prj_123',
          originProvider: 'vercel',
          reason: ResolutionReason.PAUSED,
          sdkVersion: expect.any(String),
        }),
      },
    ]);
  });
});
