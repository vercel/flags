import { describe, expect, expectTypeOf, it } from 'vitest';
import { defineConnection } from './connection';
import { defineFlag } from './flag';
import { runtime } from './runtime';
import type {
  FlagsRequest,
  ReadonlyRequestCookies,
  RequestCookie,
} from './types';

// A framework adapter can add optional properties
declare module './types' {
  interface FlagsRequest {
    readonly params?: Record<string, string>;
  }
}

describe('FlagsRequest', () => {
  it('accepts a Web Request', () => {
    expectTypeOf<Request>().toExtend<FlagsRequest>();
  });

  it('accepts the cookies of Next.js', () => {
    // The shape of ReadonlyRequestCookies of Next.js
    interface NextCookies {
      get(...args: [name: string] | [RequestCookie]): RequestCookie | undefined;
      getAll(...args: [name: string] | [RequestCookie] | []): RequestCookie[];
      has(name: string): boolean;
      readonly size: number;
    }
    expectTypeOf<NextCookies>().toExtend<ReadonlyRequestCookies>();
  });

  it('requires headers', () => {
    // @ts-expect-error headers are required
    expectTypeOf<{ url: string }>().toExtend<FlagsRequest>();
  });

  it('gives added properties to the steps', async () => {
    let teamId: string | undefined;
    const connection = defineConnection({
      provider: {
        metadata: { name: 'test' },
        resolveBooleanEvaluation: async () => ({ value: true }),
      },
      project: { platform: 'in-memory' },
      getEvaluationContext: (_context, request) => {
        teamId = request?.params?.teamId;
        return {};
      },
    });
    const flag = defineFlag({ key: 'a', connection });

    await runtime.onInvoke(
      { headers: new Headers(), params: { teamId: 'team-1' } },
      () => flag(),
    );
    expect(teamId).toBe('team-1');
  });
});
