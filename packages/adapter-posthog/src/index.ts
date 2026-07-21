import type { Adapter } from 'flags';
import { PostHog } from 'posthog-node';
import type { JsonType, PostHogAdapter, PostHogEntities } from './types';

export { getProviderData } from './provider';
export type { PostHogEntities, JsonType };

type FlagEvaluations = Awaited<ReturnType<PostHog['evaluateFlags']>>;

// Builds an adapter (with a single-flag `decide` and a batched `bulkDecide`)
// around one way of reading a value out of an `evaluateFlags` snapshot. The
// value adapter reads `getFlag`, the payload adapter reads `getFlagPayload`.
function createFlagAdapter(
  client: PostHog,
  adapterId: symbol,
  read: (snapshot: FlagEvaluations, key: string) => unknown,
  isPresent: (value: unknown) => boolean,
  noun: 'value' | 'payload',
): Adapter<unknown, PostHogEntities> {
  return {
    adapterId,
    async decide({ key, entities, defaultValue }) {
      const { distinctId } = parseEntities(entities);
      const flagKey = trimKey(key);
      const snapshot = await client.evaluateFlags(distinctId, {
        flagKeys: [flagKey],
      });
      const value = read(snapshot, flagKey);
      if (!isPresent(value)) {
        if (typeof defaultValue !== 'undefined') return defaultValue;
        throw new Error(
          `PostHog Adapter found no ${noun} for ${flagKey} and no default value was provided.`,
        );
      }
      return value;
    },
    async bulkDecide({ flags, entities }) {
      const { distinctId } = parseEntities(entities);
      // One PostHog flag can back multiple SDK flags (see `trimKey`), so
      // dedupe the underlying keys before scoping the request.
      const flagKeys = Array.from(
        new Set(flags.map(({ key }) => trimKey(key))),
      );
      const snapshot = await client.evaluateFlags(distinctId, { flagKeys });
      const out: Record<string, unknown> = {};
      for (const { key } of flags) {
        const value = read(snapshot, trimKey(key));
        // Omit absent values so the SDK applies each flag's `defaultValue`.
        if (isPresent(value)) out[key] = value;
      }
      return out;
    },
  };
}

export function createPostHogAdapter({
  postHogKey,
  postHogOptions,
}: {
  postHogKey: ConstructorParameters<typeof PostHog>[0];
  postHogOptions: ConstructorParameters<typeof PostHog>[1];
}): PostHogAdapter {
  const client = new PostHog(postHogKey, postHogOptions);

  // Stable identities captured in this closure so every adapter object the
  // factories below hand out shares them. `evaluate()` batches flags whose
  // adapters share an `adapterId` (and `identify` source) into a single
  // `evaluateFlags` request. Value and payload need separate ids because
  // `bulkDecide` returns one value per key and can't tell from the key alone
  // whether the caller wanted the flag value or its payload.
  const valueAdapter = createFlagAdapter(
    client,
    Symbol('postHogAdapter.value'),
    // `getFlag` returns `false` for a disabled flag (a real value) and
    // `undefined` only when the flag was not returned by the evaluation.
    (snapshot, key) => snapshot.getFlag(key),
    (value) => value !== undefined,
    'value',
  );

  const payloadAdapter = createFlagAdapter(
    client,
    Symbol('postHogAdapter.payload'),
    (snapshot, key) => snapshot.getFlagPayload(key),
    (value) => Boolean(value),
    'payload',
  );

  const adapter = (<ValueType>() =>
    valueAdapter as Adapter<ValueType, PostHogEntities>) as PostHogAdapter;
  adapter.payload = <ValueType>() =>
    payloadAdapter as Adapter<ValueType, PostHogEntities>;

  return adapter;
}

function parseEntities(entities?: PostHogEntities): PostHogEntities {
  if (!entities) {
    throw new Error(
      'PostHog Adapter: Missing entities, ' +
        'flag must be defined with an identify() function.',
    );
  }
  return entities;
}

function assertEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`PostHog Adapter: Missing ${name} environment variable`);
  }
  return value;
}

// Read until the first `.`
// This supports defining multiple flags with the same key
// Ex. with my-flag.is-enabled, my-flag.variant and my-flag.payload
function trimKey(key: string): string {
  return key.split('.')[0] as string;
}

let defaultPostHogAdapter: PostHogAdapter | undefined;

/**
 * Internal function for testing purposes
 */
export function resetDefaultPostHogAdapter() {
  defaultPostHogAdapter = undefined;
}

function getOrCreateDefaultAdapter(): PostHogAdapter {
  if (!defaultPostHogAdapter) {
    // Evaluation mode is an explicit choice, not a side effect of any other
    // credential. Local evaluation is opt-in via POSTHOG_SECRET_KEY (a `phs_`
    // project secret key). When it is set, posthog-node polls flag definitions
    // and evaluates flags in-process; otherwise flags are evaluated remotely.
    //
    // Note: POSTHOG_PERSONAL_API_KEY is only used by getProviderData (Flags
    // Explorer discovery) and is intentionally never passed to the runtime
    // client, so it does not enable local-evaluation polling.
    const secretKey = process.env.POSTHOG_SECRET_KEY;

    defaultPostHogAdapter = createPostHogAdapter({
      postHogKey: assertEnv('NEXT_PUBLIC_POSTHOG_KEY'),
      postHogOptions: {
        host: assertEnv('NEXT_PUBLIC_POSTHOG_HOST'),
        secretKey,
        enableLocalEvaluation: Boolean(secretKey),
        // Presumption: Server IP is likely not a good proxy for user location
        disableGeoip: true,
      },
    });
  }
  return defaultPostHogAdapter;
}

/**
 * The default PostHog adapter, initialized lazily from environment variables on
 * first use. Pass it uninvoked (`adapter: postHogAdapter`) or invoked
 * (`adapter: postHogAdapter()`) to read a flag's value, or use
 * `postHogAdapter.payload` to read the flag's attached payload.
 */
export const postHogAdapter: PostHogAdapter = Object.assign(
  <ValueType>() => getOrCreateDefaultAdapter()<ValueType>(),
  {
    payload: <ValueType>() => getOrCreateDefaultAdapter().payload<ValueType>(),
  },
);
