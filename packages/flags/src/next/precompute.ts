/**
 * Precompute for Next.js: evaluate flags in the proxy, put their values into
 * a signed code in the URL, and render a static page for each combination
 * of values. It is a feature of Next.js, not a part of the runtime or of the
 * standard of the SDK.
 *
 * The API and the format of the code are those of v4, so that a code of v4
 * is still valid. The secret is `FLAGS_PRECOMPUTE_SECRET`, not `FLAGS_SECRET`
 * of v4: one secret for each purpose.
 */
import { base64url, CompactSign, compactVerify } from 'jose';
import {
  type EvaluateContext,
  type EvaluateResults,
  evaluate,
  type FlagValueOfFlag,
} from '../evaluate';
import { type FlagDefinition, runtime } from '../runtime';
import type { FlagsRequestInit } from '../types';
import { type FlagValue, optionIndex } from '../value-types';

type Flags = readonly FlagDefinition[];

/**
 * The code of an empty list of flags.
 */
const NO_FLAGS = '__no_flags__';

// One byte for each flag: the index of its option, or one of these values.
// Thus, a flag can have up to 252 options in the code.
const MAX_OPTIONS = 252;
const NULL = 252;
const FALSE = 253;
const TRUE = 254;
// The value follows as JSON after the bytes of all flags
const UNLISTED = 255;

/**
 * `FLAGS_PRECOMPUTE_SECRET`, or else the secret of the build which
 * `withFlags` of `flags/next/plugin` puts into the server code. The
 * bundler replaces `process.env.__FLAGS_PRECOMPUTE_BUILD_SECRET` with a
 * string. Nothing sets it at runtime, so without the plugin it is
 * `undefined`.
 */
function defaultSecret(): string | undefined {
  return (
    process.env.FLAGS_PRECOMPUTE_SECRET ||
    process.env.__FLAGS_PRECOMPUTE_BUILD_SECRET
  );
}

function secretOrThrow(secret: string | undefined, name: string): string {
  if (!secret) {
    throw new Error(
      `flags: ${name} needs a secret. Use withFlags of flags/next/plugin, or set the environment variable FLAGS_PRECOMPUTE_SECRET.`,
    );
  }
  return secret;
}

export interface PrecomputeOptions<In> {
  /**
   * The request, e.g. the request of the proxy. The flags are evaluated in
   * `runtime.onInvoke` with it, so that the evaluation context chain and the
   * overrides get it.
   */
  request?: FlagsRequestInit;
  /**
   * The first input of the evaluation context chain, for each flag.
   */
  evaluationContext: In;
  /**
   * The secret which signs the code. The default is
   * `FLAGS_PRECOMPUTE_SECRET`, or else the secret of the build of
   * `withFlags`.
   */
  secret?: string;
}

/**
 * The options are optional if the flags accept `undefined` as their
 * evaluation context.
 */
export type PrecomputeArgs<In> = undefined extends In
  ? [options?: Partial<PrecomputeOptions<In>>]
  : [options: PrecomputeOptions<In>];

/**
 * Evaluates a list of flags, and returns a short, signed code with their
 * values. Put the code into the URL in the proxy, and read the values on the
 * page with `getPrecomputed`.
 *
 * @example
 * ```ts
 * // proxy.ts
 * export async function proxy(request: NextRequest) {
 *   const code = await precompute(marketingFlags, { request });
 *   return NextResponse.rewrite(new URL(`/${code}`, request.url));
 * }
 * ```
 */
export async function precompute<const F extends Flags>(
  flags: F,
  ...args: PrecomputeArgs<EvaluateContext<F>>
): Promise<string> {
  const options = args[0] as Partial<PrecomputeOptions<unknown>> | undefined;
  const run = () =>
    evaluate(
      flags as Flags,
      {
        evaluationContext: options?.evaluationContext,
      } as never,
    ) as Promise<FlagValue[]>;
  const values = options?.request
    ? await runtime.onInvoke(options.request, run)
    : await run();
  return serialize(flags, values, options?.secret);
}

/**
 * Returns the values of the flags as a record, by the key of each flag.
 */
export function combine(
  flags: Flags,
  values: readonly unknown[],
): Record<string, FlagValue> {
  return Object.fromEntries(
    flags.map((flag, i) => [flag.key, values[i] as FlagValue]),
  );
}

/**
 * Turns a list of flags and their values into a short, signed code. The
 * signature prevents that a visitor sets the values in the URL.
 *
 * A value which is one of the options of its flag takes one byte. Booleans
 * take one byte also without options.
 */
export async function serialize(
  flags: Flags,
  values: readonly unknown[],
  secret: string | undefined = defaultSecret(),
): Promise<string> {
  const key = secretOrThrow(secret, 'serialize');
  if (flags.length === 0) return NO_FLAGS;

  const unlisted: unknown[] = [];
  const bytes = flags.map((flag, index) => {
    const value = values[index];
    if (value === undefined) {
      throw new Error(`flags: Missing value for flag "${flag.key}".`);
    }
    if (value === null) return NULL;
    if (value === false) return FALSE;
    if (value === true) return TRUE;
    const option = flag.options ? optionIndex(value, flag.options) : -1;
    if (option > -1 && option < MAX_OPTIONS) return option;
    unlisted.push(value);
    return UNLISTED;
  });

  let payload = new Uint8Array(bytes);
  if (unlisted.length > 0) {
    // Without the brackets of the array, which deserialize adds again
    const json = new TextEncoder().encode(
      JSON.stringify(unlisted).slice(1, -1),
    );
    const joined = new Uint8Array(payload.length + json.length);
    joined.set(payload);
    joined.set(json, payload.length);
    payload = joined;
  }
  return new CompactSign(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .sign(base64url.decode(key));
}

// A page reads the same code several times, e.g. once for each flag
let lastVerification:
  | { code: string; secret: string; payload: Promise<Uint8Array> }
  | undefined;

function verify(code: string, secret: string): Promise<Uint8Array> {
  if (lastVerification?.code === code && lastVerification.secret === secret) {
    return lastVerification.payload;
  }
  const payload = compactVerify(code, base64url.decode(secret), {
    algorithms: ['HS256'],
  }).then(
    (result) => result.payload,
    (error: unknown) => {
      throw new Error('flags: The precomputed code is not valid.', {
        cause: error,
      });
    },
  );
  lastVerification = { code, secret, payload };
  return payload;
}

/**
 * Reads the values of all flags from a code of `serialize` or `precompute`.
 * `flags` must be the same list, in the same order. Throws if the signature
 * is not valid.
 */
export async function deserialize(
  flags: Flags,
  code: string,
  secret: string | undefined = defaultSecret(),
): Promise<Record<string, FlagValue>> {
  const key = secretOrThrow(secret, 'deserialize');
  if (code === NO_FLAGS) return {};

  const payload = await verify(code, key);
  if (payload.length < flags.length) {
    throw new Error(
      'flags: The precomputed code does not match the flags. Use the same list of flags as for precompute.',
    );
  }
  const bytes = payload.slice(0, flags.length);
  const json = payload.slice(flags.length);
  const unlisted: FlagValue[] =
    json.length > 0 ? JSON.parse(`[${new TextDecoder().decode(json)}]`) : [];

  let next = 0;
  const values: Record<string, FlagValue> = {};
  flags.forEach((flag, index) => {
    const byte = bytes[index];
    if (byte === FALSE) values[flag.key] = false;
    else if (byte === TRUE) values[flag.key] = true;
    else if (byte === NULL) values[flag.key] = null as unknown as FlagValue;
    else if (byte === UNLISTED)
      values[flag.key] = unlisted[next++] as FlagValue;
    else {
      const option = flag.options?.[byte as number];
      if (!option) {
        throw new Error(
          `flags: The precomputed code does not match the options of flag "${flag.key}".`,
        );
      }
      values[flag.key] = option.value;
    }
  });
  return values;
}

/**
 * Reads the value of one flag from a code of `precompute`.
 *
 * @param flag - The flag to read.
 * @param group - The list of flags which `precompute` received.
 * @param code - The code of `precompute`, e.g. from the params of the page.
 */
export async function getPrecomputed<F extends FlagDefinition>(
  flag: F,
  group: Flags,
  code: string,
  secret?: string,
): Promise<FlagValueOfFlag<F>>;
/**
 * Reads the values of several flags from a code of `precompute`. Returns
 * them in the order of `flags`.
 */
export async function getPrecomputed<const F extends Flags>(
  flags: F,
  group: Flags,
  code: string,
  secret?: string,
): Promise<EvaluateResults<F>>;
export async function getPrecomputed(
  flagOrFlags: FlagDefinition | Flags,
  group: Flags,
  code: string,
  secret: string | undefined = defaultSecret(),
): Promise<unknown> {
  secretOrThrow(secret, 'getPrecomputed');
  const values = await deserialize(group, code, secret);
  const read = (flag: FlagDefinition) => {
    if (!Object.hasOwn(values, flag.key)) {
      throw new Error(
        `flags: Flag "${flag.key}" is not part of the precomputed flags. Add it to the list which precompute receives.`,
      );
    }
    return values[flag.key];
  };
  return Array.isArray(flagOrFlags)
    ? flagOrFlags.map(read)
    : read(flagOrFlags as FlagDefinition);
}

function* combinations<T>(lists: readonly (readonly T[])[]): Generator<T[]> {
  const [first, ...rest] = lists;
  if (!first) {
    yield [];
    return;
  }
  for (const tail of combinations(rest)) {
    for (const head of first) yield [head, ...tail];
  }
}

/**
 * Returns the code of each combination of the options of the flags, e.g.
 * for `generateStaticParams`. A boolean flag without options has the values
 * `false` and `true`. Each other flag must have options.
 *
 * @param filter - Returns `false` for a combination which needs no page.
 */
export async function generatePermutations(
  flags: Flags,
  filter: ((values: Record<string, FlagValue>) => boolean) | null = null,
  secret: string | undefined = defaultSecret(),
): Promise<string[]> {
  const key = secretOrThrow(secret, 'generatePermutations');
  if (flags.length === 0) return [NO_FLAGS];

  const lists = flags.map((flag) => {
    if (flag.options) return flag.options.map((option) => option.value);
    if ((flag.type ?? 'boolean') === 'boolean') return [false, true];
    throw new Error(
      `flags: Flag "${flag.key}" needs options to generate permutations, because it is not a boolean flag.`,
    );
  });

  const codes: Promise<string>[] = [];
  for (const values of combinations(lists)) {
    if (filter && !filter(combine(flags, values))) continue;
    codes.push(serialize(flags, values, key));
  }
  return Promise.all(codes);
}
