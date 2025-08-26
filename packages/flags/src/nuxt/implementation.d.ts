declare module '#flags-implementation' {
  import type { H3Event } from 'h3';
  import type { Identify, JsonValue } from 'flags';

  export function getState<ValueType>(
    key: string,
    event?: H3Event,
  ): { value: ValueType };
  export function getStore<T>(event?: H3Event): T;

  export interface FlagStore {
    event: H3Event;
    secret: string;
    params: Record<string, string | string[]>;
    usedFlags: Record<string, Promise<JsonValue>>;
    identifiers: Map<Identify<unknown>, ReturnType<Identify<unknown>>>;
  }
}
