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
import { defineConnection } from '../connection';
import { defineFlag } from '../flag';
import { encryptOverrides } from '../overrides';
import { runtime } from '../runtime';
import {
  deserialize,
  generatePermutations,
  getPrecomputed,
  precompute,
  serialize,
} from './precompute';

const secret = 'Tw1R5-WuhN6vxp9b0s6h0bCdrBQwZXMbGwjzYm1jnUs';

function createConnection() {
  return defineConnection({
    provider: new TypedInMemoryProvider({
      'summer-sale': {
        variants: { on: true, off: false },
        defaultVariant: 'off',
        disabled: false,
        contextEvaluator: (context) =>
          context.user === 'alice' ? 'on' : 'off',
      },
      checkout: {
        variants: { control: 'control', express: 'express' },
        defaultVariant: 'express',
        disabled: false,
      },
      banner: {
        variants: { hello: 'Hello' },
        defaultVariant: 'hello',
        disabled: false,
      },
    } as const),
    project: { platform: 'in-memory' },
    getEvaluationContext: (_context, request) => ({
      user: request?.cookies?.get('user')?.value ?? 'anonymous',
    }),
  });
}

function createFlags() {
  const connection = createConnection();
  const summerSale = defineFlag({ key: 'summer-sale', connection });
  const checkout = defineFlag({
    key: 'checkout',
    type: 'string',
    options: ['control', 'express'],
    connection,
  });
  const banner = defineFlag({ key: 'banner', type: 'string', connection });
  return {
    summerSale,
    checkout,
    banner,
    group: [summerSale, checkout, banner],
  };
}

beforeEach(() => {
  runtime.reset();
  vi.stubEnv('FLAGS_PRECOMPUTE_SECRET', secret);
  // Only for the override cookies
  vi.stubEnv(
    'FLAGS_SECRET',
    Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(
      'base64url',
    ),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('precompute', () => {
  it('evaluates the flags with the request, and reads them from the code', async () => {
    const { summerSale, checkout, banner, group } = createFlags();
    const request = new Request('https://shop.example', {
      headers: { cookie: 'user=alice' },
    });

    const code = await precompute(group, { request });

    await expect(getPrecomputed(summerSale, group, code)).resolves.toBe(true);
    await expect(
      getPrecomputed([checkout, banner], group, code),
    ).resolves.toEqual(['express', 'Hello']);
    await expect(deserialize(group, code)).resolves.toEqual({
      'summer-sale': true,
      checkout: 'express',
      banner: 'Hello',
    });
  });

  it('gives the values the types of the flags', async () => {
    const { summerSale, checkout, group } = createFlags();
    const code = await precompute(group);

    expectTypeOf(
      await getPrecomputed(summerSale, group, code),
    ).toEqualTypeOf<boolean>();
    expectTypeOf(
      await getPrecomputed([summerSale, checkout], group, code),
    ).toEqualTypeOf<[boolean, 'control' | 'express']>();
  });

  it('applies the overrides of the request', async () => {
    const { summerSale, group } = createFlags();
    const token = await encryptOverrides({ 'summer-sale': true });
    const request = new Request('https://shop.example', {
      headers: { cookie: `flag-overrides=${token}` },
    });

    const code = await precompute(group, { request });
    await expect(getPrecomputed(summerSale, group, code)).resolves.toBe(true);
  });

  it('reads a code of v4', async () => {
    const { summerSale, checkout, banner, group } = createFlags();
    // Created by serialize of flags v4 with the same flags, and with this
    // secret as FLAGS_SECRET
    const code =
      'eyJhbGciOiJIUzI1NiJ9._gH_IkhlbGxvIg.GZ-saLB0vB_iGKH2FPLq4HrI_EK22LKiBkT1cIq6OdQ';

    await expect(
      getPrecomputed([summerSale, checkout, banner], group, code),
    ).resolves.toEqual([true, 'express', 'Hello']);
    // v5 creates the same code
    await expect(serialize(group, [true, 'express', 'Hello'])).resolves.toBe(
      code,
    );
  });

  it('rejects a code with a wrong signature', async () => {
    const { group } = createFlags();
    const code = await serialize(group, [true, 'express', 'Hello'], secret);
    const other = 'nZ0XQV0w2sYxKqI9Yz1KZ6dX7c8x5mQe3vB4rT1uL0o';

    await expect(deserialize(group, code, other)).rejects.toThrow(
      'flags: The precomputed code is not valid.',
    );
  });

  it('throws for a flag which is not part of the code', async () => {
    const { summerSale, checkout } = createFlags();
    const code = await serialize([summerSale], [true]);

    await expect(getPrecomputed(checkout, [summerSale], code)).rejects.toThrow(
      'flags: Flag "checkout" is not part of the precomputed flags.',
    );
  });

  it('uses the secret of the build which withFlags inlines', async () => {
    vi.stubEnv('FLAGS_PRECOMPUTE_SECRET', '');
    // What the bundler does with compiler.defineServer of withFlags
    vi.stubEnv('__FLAGS_PRECOMPUTE_BUILD_SECRET', secret);
    const { summerSale, group } = createFlags();

    const code = await precompute(group);
    await expect(getPrecomputed(summerSale, group, code, secret)).resolves.toBe(
      false,
    );
  });

  it('prefers FLAGS_PRECOMPUTE_SECRET to the secret of the build', async () => {
    vi.stubEnv('__FLAGS_PRECOMPUTE_BUILD_SECRET', 'b3RoZXI');
    const { summerSale, group } = createFlags();

    const code = await precompute(group);
    await expect(getPrecomputed(summerSale, group, code, secret)).resolves.toBe(
      false,
    );
  });

  it('throws without a secret, also when FLAGS_SECRET is set', async () => {
    vi.stubEnv('FLAGS_PRECOMPUTE_SECRET', '');
    const { group } = createFlags();

    await expect(precompute(group)).rejects.toThrow(
      'flags: serialize needs a secret. Use withFlags of flags/next/plugin, or set the environment variable FLAGS_PRECOMPUTE_SECRET.',
    );
  });

  it('keeps object values which are not one of the options', async () => {
    const connection = createConnection();
    const theme = defineFlag({ key: 'theme', type: 'object', connection });
    const code = await serialize([theme], [{ color: 'blue' }]);

    await expect(getPrecomputed(theme, [theme], code)).resolves.toEqual({
      color: 'blue',
    });
  });

  it('has a code for an empty list', async () => {
    await expect(precompute([])).resolves.toBe('__no_flags__');
    await expect(deserialize([], '__no_flags__')).resolves.toEqual({});
  });
});

describe('generatePermutations', () => {
  it('returns a code for each combination of options', async () => {
    const { summerSale, checkout, group } = createFlags();
    const flags = [summerSale, checkout];

    const codes = await generatePermutations(flags);
    const values = await Promise.all(
      codes.map((code) => deserialize(flags, code)),
    );
    expect(values).toEqual([
      { 'summer-sale': false, checkout: 'control' },
      { 'summer-sale': true, checkout: 'control' },
      { 'summer-sale': false, checkout: 'express' },
      { 'summer-sale': true, checkout: 'express' },
    ]);
    expect(group).toHaveLength(3);
  });

  it('skips the combinations which the filter rejects', async () => {
    const { summerSale, checkout } = createFlags();

    const codes = await generatePermutations(
      [summerSale, checkout],
      (values) => values.checkout === 'express',
    );
    expect(codes).toHaveLength(2);
  });

  it('requires options for a flag which is not a boolean', async () => {
    const { banner } = createFlags();

    await expect(generatePermutations([banner])).rejects.toThrow(
      'flags: Flag "banner" needs options to generate permutations, because it is not a boolean flag.',
    );
  });
});
