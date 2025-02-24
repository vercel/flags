import { FlagOption } from '../types';

export type Flag<ReturnValue> = ((
  /** Only provide this if you're retrieving the flag value outside of the lifecycle of the `handle` hook, e.g. when calling it inside edge middleware. */
  request?: Request,
  secret?: string,
) => ReturnValue | Promise<ReturnValue>) & {
  key: string;
  description?: string;
  origin?: string | Record<string, unknown>;
  options?: FlagOption<ReturnValue>[];
};
