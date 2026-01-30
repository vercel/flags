/**
 * OpenFeature provider for Next.js App Router
 *
 * There is also openfeature.default.ts which targets default runtimes.
 * If you update this file, please update openfeature.default.ts as well.
 *
 * This file should stay equivalent to openfeature.default.ts, except that it
 * imports from index.next-js to get cached functions.
 */

import { createClient } from './index.next-js';
import { make } from './openfeature.make';

export const VercelProvider = make(createClient);
