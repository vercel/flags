import { TypedInMemoryProvider } from '@openfeature/server-sdk';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest';
import { getDecideSource } from './decide';
import { evaluate } from './evaluate';
import { bindFlag, defineFlag } from './flag';
import { DECIDE_REASON } from './hooks';
import { createManifest } from './manifest';
import { encryptOverrides } from './overrides';
import { runtime } from './runtime';
import { defineSource } from './source';
import type { FlagsRequest, Hook } from './types';

const request = (cookie = '') =>
  new Request('https://shop.example', { headers: { cookie } });

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  runtime.reset();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('defineFlag with decide', () => {
  it('decides the value in the code', async () => {
    const myFlag = defineFlag({ key: 'my-flag', decide: () => true });

    expect(myFlag.key).toBe('my-flag');
    expect(myFlag.type).toBe('boolean');
    await expect(myFlag()).resolves.toBe(true);
  });

  it('uses the internal source of inline flags', () => {
    const myFlag = defineFlag({ key: 'my-flag', decide: () => true });

    expect(myFlag.source).toBe(getDecideSource());
    expect(runtime.sources.has(getDecideSource())).toBe(true);
  });

  it('gives decide the context of the call side and the request', async () => {
    const decide = vi.fn(
      (context: { teamId: string }, request: FlagsRequest | undefined) =>
        context.teamId === 'acme' &&
        request?.cookies?.get('beta') !== undefined,
    );
    const beta = defineFlag({ key: 'beta', decide });

    const value = await runtime.onInvoke(request('beta=1'), () =>
      beta({ evaluationContext: { teamId: 'acme' } }),
    );
    expect(value).toBe(true);
    expect(decide.mock.calls[0]?.[0]).toEqual({ teamId: 'acme' });
    expect(decide.mock.calls[0]?.[1]?.cookies?.get('beta')?.value).toBe('1');
  });

  it('gives decide no request outside of a request', async () => {
    const decide = vi.fn(() => false);
    await defineFlag({ key: 'a', decide })();

    expect(decide).toHaveBeenCalledWith(undefined, undefined);
  });

  it('decides once per request and input', async () => {
    const decide = vi.fn(() => true);
    const myFlag = defineFlag({ key: 'my-flag', decide });

    await runtime.onInvoke(request(), () =>
      Promise.all([myFlag(), myFlag(), evaluate(myFlag)]),
    );
    expect(decide).toHaveBeenCalledTimes(1);
  });

  it('supports the other types', async () => {
    const banner = defineFlag({
      key: 'banner',
      type: 'string',
      decide: () => 'Summer sale!',
    });
    const limits = defineFlag({
      key: 'limits',
      type: 'object',
      decide: async () => ({ items: 3 }),
    });

    await expect(banner()).resolves.toBe('Summer sale!');
    await expect(limits()).resolves.toEqual({ items: 3 });
  });

  it('returns the default value when decide throws', async () => {
    const myFlag = defineFlag({
      key: 'my-flag',
      defaultValue: false,
      decide: () => {
        throw new Error('No database');
      },
    });

    await expect(myFlag()).resolves.toBe(false);
  });

  it('throws without a default value when decide throws', async () => {
    const myFlag = defineFlag({
      key: 'my-flag',
      decide: () => {
        throw new Error('No database');
      },
    });

    await expect(myFlag()).rejects.toMatchObject({
      message: 'flags: Could not evaluate flag "my-flag": No database',
    });
  });

  it('fails when decide returns a value of a different type', async () => {
    // @ts-expect-error the flag is a boolean, so decide must return one
    const myFlag = defineFlag({ key: 'my-flag', decide: () => 'yes' });

    await expect(myFlag()).rejects.toMatchObject({ code: 'TYPE_MISMATCH' });
  });

  it('applies overrides of Flags Explorer', async () => {
    vi.stubEnv(
      'FLAGS_SECRET',
      Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(
        'base64url',
      ),
    );
    const decide = vi.fn(() => false);
    const myFlag = defineFlag({ key: 'my-flag', decide });
    const token = await encryptOverrides({ 'my-flag': true });

    const value = await runtime.onInvoke(
      request(`flag-overrides=${token}`),
      () => myFlag(),
    );
    expect(value).toBe(true);
    expect(decide).not.toHaveBeenCalled();
  });

  it('runs hooks with the reason DECIDE', async () => {
    const seen: string[] = [];
    const hook: Hook = {
      after: (context, details) => {
        seen.push(
          `${context.providerMetadata.name} ${details.value} ${details.reason}`,
        );
      },
    };
    runtime.configure({ hooks: [hook] });

    await defineFlag({ key: 'a', decide: () => true })();
    expect(seen).toEqual([`decide true ${DECIDE_REASON}`]);
  });

  it('is in the manifest like each other flag', () => {
    const manifest = createManifest([
      {
        id: 'flags.ts',
        exports: {
          myFlag: defineFlag({
            key: 'my-flag',
            decide: () => false,
            options: [false, true],
            description: 'My flag',
          }),
        },
      },
    ]);

    expect(manifest.definitions['my-flag']).toMatchObject({
      type: 'boolean',
      options: [{ value: false }, { value: true }],
      description: 'My flag',
      source: 'in-memory',
    });
  });

  it('rejects decide together with a source', () => {
    const source = defineSource({
      provider: new TypedInMemoryProvider({}),
      project: { system: 'in-memory' },
    });

    expect(() =>
      // @ts-expect-error an inline flag has no source
      defineFlag({ key: 'a', decide: () => true, source }),
    ).toThrow('flags: Flag "a" has decide and a source.');
  });

  it('needs decide, and points to bindFlag for the flag of a source', () => {
    expect(() =>
      // @ts-expect-error an inline flag needs decide
      defineFlag({ key: 'a' }),
    ).toThrow(
      'flags: Flag "a" has no decide. Use bindFlag for the flag of a source.',
    );
  });

  it('rejects a decide which is not a function', () => {
    expect(() =>
      // @ts-expect-error decide is a function
      defineFlag({ key: 'a', decide: true }),
    ).toThrow('flags: The decide of flag "a" must be a function.');
  });

  it('has the types of its options and of its context', () => {
    const myFlag = defineFlag({
      key: 'my-flag',
      decide: () => false,
      options: [false, true] as const,
    });
    expectTypeOf(myFlag).returns.resolves.toEqualTypeOf<boolean>();
    // Without a context, the call side gives nothing
    expectTypeOf(myFlag).toBeCallableWith();

    const plan = defineFlag({
      key: 'plan',
      type: 'string',
      options: ['free', 'pro'] as const,
      decide: (context: { teamId: string }) =>
        context.teamId === 'acme' ? 'pro' : 'free',
    });
    expectTypeOf(plan).returns.resolves.toEqualTypeOf<
      'free' | 'pro' | (string & {})
    >();
    expectTypeOf(plan).toBeCallableWith({
      evaluationContext: { teamId: 'acme' },
    });
    // @ts-expect-error the call side must give the team
    expectTypeOf(plan).toBeCallableWith();
  });
});

describe('bindFlag', () => {
  const provider = () =>
    new TypedInMemoryProvider({
      'enable-dashboard': {
        variants: { on: true, off: false },
        defaultVariant: 'on',
        disabled: false,
      },
    });

  it('declares a flag of a source', async () => {
    const source = defineSource({
      provider: provider(),
      project: { system: 'in-memory' },
    });
    const enableDashboard = bindFlag({
      key: 'enable-dashboard',
      source,
      options: [false, true] as const,
    });

    expect(enableDashboard.source).toBe(source);
    expect(runtime.sources.has(source)).toBe(true);
    await expect(enableDashboard()).resolves.toBe(true);
    expectTypeOf(enableDashboard).returns.resolves.toEqualTypeOf<boolean>();
  });

  it('uses the default source without a source', () => {
    const flag = bindFlag({ key: 'a' });

    expect(flag.source).toBe(runtime.defaultSource);
  });

  it('rejects decide', () => {
    expect(() =>
      // @ts-expect-error decide is for inline flags
      bindFlag({ key: 'a', decide: () => true }),
    ).toThrow('flags: Flag "a" has decide. Use defineFlag for inline flags.');
  });
});
