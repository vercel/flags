import type { FlagOption } from '../types';

type FlagsMeta<ReturnValue> = {
  key: string;
  description?: string;
  origin?: string | Record<string, unknown>;
  options?: FlagOption<ReturnValue>[];
};

type RegularFlag<ReturnValue> = {
  (): ReturnValue | Promise<ReturnValue>;
  (
    /**
     * Only provide this if you're retrieving the flag value outside of a request
     * context where `getRequest()` is available (e.g. when calling it from code
     * that runs before TanStack Start established the request). In a route
     * loader, server function, or server route you can call the flag without any
     * arguments.
     */
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
    secret?: string,
  ): ReturnValue | Promise<ReturnValue>;
} & FlagsMeta<ReturnValue>;

export type Flag<ReturnValue> =
  | RegularFlag<ReturnValue>
  | PrecomputedFlag<ReturnValue>;

export type FlagsArray = readonly Flag<any>[];
