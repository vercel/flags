/**
 * Exports for default runtimes
 *
 * There is also index.next-js.ts which targets Next.js specifically.
 * If you update this file, please update index.next-js.ts as well.
 *
 * Try keeping this file small. Export through index.common and index.make.
 *
 * This file has JSDoc on its exports which will be used by the editor.
 * We do not need to repeat the JSDoc on the next-js export.
 */

import * as fns from './client-fns';
import { createCreateRawClient } from './create-raw-client';
import { make } from './index.make';

export * from './index.common';

export const {
  /**
   * A lazily-initialized default flags client.
   *
   * - relies on process.env.FLAGS
   * - does not use process.env.EDGE_CONFIG
   */
  flagsClient,
  /**
   * For testing purposes
   */
  resetDefaultFlagsClient,
  /**
   * Create a flags client based on an SDK Key
   */
  createClient,
} = make(createCreateRawClient(fns));
