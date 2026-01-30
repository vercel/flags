import { createCreateRawClient } from './create-raw-client';
import { make } from './index.make';
import * as fns from './raw-client';

export * from './index.common';
export const createRawClient = createCreateRawClient(fns);

export const { flagsClient, resetDefaultFlagsClient, createClient } =
  make(createRawClient);
