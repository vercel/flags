import { FlagOption } from '../types';

type FlagsMeta<ReturnValue> = {
  key: string;
  description?: string;
  origin?: string | Record<string, unknown>;
  options?: FlagOption<ReturnValue>[];
};

type RegularFlag<ReturnValue> = {
  (): ReturnValue | Promise<ReturnValue>;
  (
    /** Only provide this if you're retrieving the flag value outside of the lifecycle of the `handle` hook, e.g. when calling it inside edge middleware. */
    request?: Request,
    secret?: string,
  ): ReturnValue | Promise<ReturnValue>;
} & FlagsMeta<ReturnValue>;

type PrecomputedFlag<ReturnValue> = {
  (): never;
  (
    /** The route parameter that contains the precomputed flag values */
    code: string,
    /** The flags which were used to create the code (i.e. the same array you passed to `precompute(...)`) */
    flagsArray: FlagsArray,
  ): ReturnValue | Promise<ReturnValue>;
} & FlagsMeta<ReturnValue>;

export type Flag<ReturnValue> =
  | RegularFlag<ReturnValue>
  | PrecomputedFlag<ReturnValue>;

export type FlagsArray = readonly Flag<any>[];
