import type { Adapter } from 'flags';

type JsonType =
  | string
  | number
  | boolean
  | null
  | {
      [key: string]: JsonType;
    }
  | Array<JsonType>;

interface PostHogEntities {
  distinctId: string;
}

/**
 * A PostHog adapter for the Flags SDK.
 *
 * Call it (or pass it uninvoked, e.g. `adapter: postHogAdapter`) to read a
 * flag's evaluated value. Use `.payload` to read the flag's attached payload
 * instead. Both forms participate in bulk evaluation via `evaluate()`.
 */
type PostHogAdapter = (<ValueType>() => Adapter<ValueType, PostHogEntities>) & {
  payload: <ValueType>() => Adapter<ValueType, PostHogEntities>;
};

export type { Adapter, PostHogEntities, PostHogAdapter, JsonType };
